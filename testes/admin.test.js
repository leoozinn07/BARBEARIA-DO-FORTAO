import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app, diaAberto, emails, encerrar, novoAdmin, novoCliente, prepararBanco, processarFila, pushes } from './ajuda.js';
import { salvarInscricao } from '../servidor/servicos/push.js';
import { db } from './ajuda.js';

before(prepararBanco);
after(encerrar);

describe('permissões do painel', () => {
  it('visitante recebe 401 e cliente recebe 403', async () => {
    assert.equal((await request(app).get('/api/admin/agenda?de=2026-10-14')).status, 401);
    const c = await novoCliente();
    assert.equal((await c.get('/api/admin/agenda?de=2026-10-14')).status, 403);
    assert.equal((await c.post('/api/admin/bloqueios', { data: '2026-10-14', dia_inteiro: true })).status, 403);
  });

  it('a página /admin redireciona quem não é admin', async () => {
    const r = await request(app).get('/admin');
    assert.equal(r.status, 302);
    assert.match(r.headers.location, /^\/entrar\?volta=/);
    const c = await novoCliente();
    const r2 = await c.get('/admin');
    assert.equal(r2.status, 302);
    assert.equal(r2.headers.location, '/conta');
  });
});

describe('agenda do Fortão', () => {
  it('vê o horário marcado pelo cliente e recebe aviso, e-mail e push', async () => {
    const admin = await novoAdmin();
    const { id } = await db.umaLinha('SELECT id FROM usuarios WHERE email = ?', [admin.email]);
    await salvarInscricao(id, { endpoint: 'https://push.exemplo.test/abc', keys: { p256dh: 'chave-p256dh-teste', auth: 'auth-teste' } });
    emails.length = 0;
    pushes.length = 0;

    const c = await novoCliente({ telefone: '11977776666' });
    const { data, horarios } = await diaAberto();
    const r = await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: horarios[0].inicio });
    assert.equal(r.status, 201);

    const agenda = await admin.get(`/api/admin/agenda?de=${data}`);
    const ag = agenda.body.agendamentos.find((a) => a.codigo === r.body.agendamento.codigo);
    assert.equal(ag.cliente_telefone, '11977776666');
    assert.equal(ag.cliente_email, c.dados.email);

    const avisos = await admin.get('/api/notificacoes');
    assert.ok(avisos.body.notificacoes.some((n) => n.tipo === 'novo_agendamento'));
    await new Promise((res) => setTimeout(res, 50));
    assert.ok(pushes.some((p) => p.carga.titulo === 'Novo horário marcado'));
    await processarFila();
    assert.ok(emails.some((m) => m.to === 'aviso@barbearia.test' && /Novo horário/.test(m.subject)));
    const confirmacao = emails.find((m) => m.to === c.dados.email && /confirmado/.test(m.subject));
    assert.ok(confirmacao.attachments.some((a) => a.filename.endsWith('.ics') && a.content.includes('BEGIN:VEVENT')));
  });

  it('cancela com motivo e o cliente é avisado', async () => {
    const admin = await novoAdmin();
    const c = await novoCliente();
    const { horarios } = await diaAberto();
    const r = await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: horarios[1].inicio });
    emails.length = 0;
    const cancel = await admin.post(`/api/admin/agendamentos/${r.body.agendamento.codigo}/cancelar`, { motivo: 'Fortão foi para a maratona' });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.agendamento.status, 'cancelado');
    const avisos = await c.get('/api/notificacoes');
    assert.match(avisos.body.notificacoes[0].corpo, /maratona/);
    await processarFila();
    assert.ok(emails.some((m) => m.to === c.dados.email && /cancelado/i.test(m.subject) && m.text.includes('maratona')));
  });

  it('não marca "concluído" antes do horário', async () => {
    const admin = await novoAdmin();
    const c = await novoCliente();
    const { horarios } = await diaAberto();
    const r = await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: horarios[2].inicio });
    const s = await admin.post(`/api/admin/agendamentos/${r.body.agendamento.codigo}/status`, { status: 'concluido' });
    assert.equal(s.status, 409);
  });

  it('marca cliente avulso (WhatsApp ou balcão) sem conta', async () => {
    const admin = await novoAdmin();
    const { horarios } = await diaAberto('corte-barba');
    const r = await admin.post('/api/admin/agendamentos', { servico: 'corte-barba', inicio: horarios[0].inicio, nome: 'Seu Jorge da padaria', telefone: '11955554444' });
    assert.equal(r.status, 201);
    assert.equal(r.body.agendamento.cliente_nome, 'Seu Jorge da padaria');
    assert.equal(r.body.agendamento.origem, 'admin');
  });

  it('edita preço do serviço e dados da barbearia', async () => {
    const admin = await novoAdmin();
    const { servicos } = (await admin.get('/api/admin/servicos')).body;
    const corte = servicos.find((s) => s.slug === 'corte-fortao');
    const r = await admin.put(`/api/admin/servicos/${corte.id}`, { nome: 'Corte Fortão', descricao: corte.descricao, preco_centavos: 4200, duracao_min: 40, ativo: true, ordem: 1 });
    assert.equal(r.status, 200);
    const pub = await request(app).get('/api/servicos');
    assert.equal(pub.body.servicos.find((s) => s.slug === 'corte-fortao').preco_centavos, 4200);

    const cfg = await admin.put('/api/admin/config', { negocio: { endereco: 'Rua do Treino, 5', whatsapp: '(11) 99999-0000', instagram: '@barbeariadofortao' } });
    assert.equal(cfg.status, 200);
    const publica = await request(app).get('/api/config');
    assert.equal(publica.body.negocio.endereco, 'Rua do Treino, 5');
    assert.equal(publica.body.negocio.whatsapp, '11999990000');
    assert.equal(publica.body.negocio.instagram, 'barbeariadofortao');
  });

  it('muda o horário de funcionamento e recusa faixas sobrepostas', async () => {
    const admin = await novoAdmin();
    const ruim = await admin.put('/api/admin/funcionamento', { faixas: [{ dia_semana: 2, abre: '09:00', fecha: '12:00' }, { dia_semana: 2, abre: '11:00', fecha: '15:00' }] });
    assert.equal(ruim.status, 422);
    const atual = (await admin.get('/api/admin/funcionamento')).body.faixas;
    const ok = await admin.put('/api/admin/funcionamento', { faixas: [...atual, { dia_semana: 0, abre: '09:00', fecha: '13:00' }] });
    assert.equal(ok.status, 200);
    const dias = (await request(app).get('/api/dias?servico=corte-fortao')).body.dias;
    assert.ok(dias.filter((d) => d.dia_semana === 0).every((d) => d.aberto));
  });

  it('resumo e busca de clientes', async () => {
    const admin = await novoAdmin();
    const resumo = await admin.get('/api/admin/resumo');
    assert.equal(resumo.status, 200);
    assert.ok(resumo.body.clientes > 0);
    const busca = await admin.get('/api/admin/clientes?q=Cliente');
    assert.ok(busca.body.clientes.length > 0);
  });
});
