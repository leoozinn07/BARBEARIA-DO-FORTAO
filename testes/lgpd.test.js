import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { agente, db, diaAberto, encerrar, novoAdmin, novoCliente, prepararBanco } from './ajuda.js';

before(prepararBanco);
after(encerrar);

describe('LGPD', () => {
  it('exporta os dados do titular em JSON', async () => {
    const c = await novoCliente();
    const { horarios } = await diaAberto();
    await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: horarios[0].inicio });
    const r = await c.get('/api/conta/dados');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-disposition'], /attachment/);
    assert.equal(r.body.titular.email, c.dados.email);
    assert.equal(r.body.agendamentos.length, 1);
    assert.ok(r.body.consentimentos.length >= 2);
  });

  it('exclui a conta: anonimiza, cancela horários futuros e impede novo login', async () => {
    const admin = await novoAdmin();
    const c = await novoCliente({ telefone: '11966665555' });
    const { horarios } = await diaAberto();
    const ag = await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: horarios[0].inicio });

    assert.equal((await c.post('/api/conta/excluir', { senha: 'senha-errada' })).status, 422);
    const r = await c.post('/api/conta/excluir', { senha: c.dados.senha });
    assert.equal(r.status, 200);

    const u = await db.umaLinha('SELECT nome, email, telefone, excluido_em FROM usuarios WHERE email LIKE ?', ['removido-%']);
    assert.equal(u.nome, 'Cliente removido');
    assert.equal(u.telefone, null);
    assert.ok(u.excluido_em);
    assert.equal((await db.umaLinha('SELECT COUNT(*) AS n FROM usuarios WHERE email = ?', [c.dados.email])).n, 0);

    const h = await db.umaLinha('SELECT status, cliente_nome, cliente_telefone FROM agendamentos WHERE codigo = ?', [ag.body.agendamento.codigo]);
    assert.equal(h.status, 'cancelado');
    assert.equal(h.cliente_nome, 'Cliente removido');
    assert.equal(h.cliente_telefone, null);

    assert.equal((await c.get('/api/conta')).status, 401);
    const novo = await agente();
    assert.equal((await novo.post('/api/auth/entrar', { email: c.dados.email, senha: c.dados.senha })).status, 401);
    const avisos = await admin.get('/api/notificacoes');
    assert.ok(avisos.body.notificacoes.some((n) => /excluiu a conta/.test(n.corpo)));
  });

  it('registra mudança de consentimento de marketing', async () => {
    const c = await novoCliente();
    const r = await c.patch('/api/conta', { marketing: true, preferencias: { tema: 'claro', letra_grande: true } });
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.marketing, true);
    assert.equal(r.body.usuario.preferencias.letra_grande, true);
    const linhas = await db.consulta(
      "SELECT aceito FROM consentimentos c JOIN usuarios u ON u.id = c.usuario_id WHERE u.email = ? AND c.tipo = 'marketing' ORDER BY c.id",
      [c.dados.email],
    );
    assert.deepEqual(linhas.map((l) => l.aceito), [0, 1]);
  });
});
