import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app, db, diaAberto, encerrar, novoAdmin, novoCliente, prepararBanco } from './ajuda.js';
import { calcularLivres } from '../servidor/servicos/agenda.js';
import { localParaUtc } from '../servidor/lib/tempo.js';

before(prepararBanco);
after(encerrar);

const REGRAS = { antecedencia_min: 30, passo_min: 15, janela_dias: 30, cancelar_ate_horas: 2 };

describe('cálculo de horários livres', () => {
  const faixas = new Map([[3, [{ abre: 9 * 60, fecha: 12 * 60 }, { abre: 13 * 60, fecha: 14 * 60 }]]]); // quarta com pausa de almoço
  const data = '2026-10-14'; // quarta
  const agora = new Date('2026-10-13T12:00:00Z');

  it('respeita faixas, duração e passo', () => {
    const livres = calcularLivres({ dataISO: data, duracaoMin: 60, faixas, ocupados: [], regras: REGRAS, agora });
    const horas = livres.map((h) => h.hora);
    assert.equal(horas[0], '09:00');
    assert.ok(horas.includes('11:00'));
    assert.ok(!horas.includes('11:15'), 'não pode passar do fechamento das 12h');
    assert.deepEqual(horas.filter((h) => h >= '13:00'), ['13:00']);
  });

  it('não encosta em horário ocupado e respeita a antecedência', () => {
    const ocupado = { ini: localParaUtc(data, 10 * 60).getTime(), fim: localParaUtc(data, 10 * 60 + 40).getTime() };
    const livres = calcularLivres({ dataISO: data, duracaoMin: 40, faixas, ocupados: [ocupado], regras: REGRAS, agora });
    const horas = livres.map((h) => h.hora);
    assert.ok(horas.includes('09:15'));
    assert.ok(!horas.includes('09:30'), '09:30 + 40 min invade as 10:00');
    assert.ok(!horas.includes('10:30'));
    assert.ok(horas.includes('10:45'));
    const quase = new Date(localParaUtc(data, 9 * 60 + 50));
    const cedo = calcularLivres({ dataISO: data, duracaoMin: 40, faixas, ocupados: [], regras: REGRAS, agora: quase });
    assert.equal(cedo[0].hora, '10:30', 'só a partir de 30 min depois de agora');
  });

  it('dia sem faixa (fechado) não tem horário', () => {
    assert.deepEqual(calcularLivres({ dataISO: '2026-10-12', duracaoMin: 40, faixas, ocupados: [], regras: REGRAS, agora }), []);
  });
});

describe('API da agenda', () => {
  it('lista dias com domingo e segunda fechados', async () => {
    const { body } = await request(app).get('/api/dias?servico=corte-fortao');
    assert.ok(body.dias.length >= 30);
    for (const d of body.dias) {
      if (d.dia_semana === 0 || d.dia_semana === 1) assert.equal(d.aberto, false);
    }
  });

  it('exige login para marcar', async () => {
    const { data, horarios } = await diaAberto();
    const r = await request(app).post('/api/agendamentos').send({ servico: 'corte-fortao', inicio: horarios[0].inicio });
    assert.ok([401, 403].includes(r.status));
    assert.ok(data);
  });

  it('recusa horário fora da grade', async () => {
    const c = await novoCliente();
    const { horarios } = await diaAberto();
    const torto = new Date(new Date(horarios[0].inicio).getTime() + 7 * 60000).toISOString();
    const r = await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: torto });
    assert.equal(r.status, 409);
  });

  it('cinco clientes no mesmo horário ao mesmo tempo: só um consegue', async () => {
    const clientes = await Promise.all([1, 2, 3, 4, 5].map(() => novoCliente()));
    const { horarios } = await diaAberto('corte-barba', 3);
    const alvo = horarios[3].inicio;
    const respostas = await Promise.all(clientes.map((c) => c.post('/api/agendamentos', { servico: 'corte-barba', inicio: alvo })));
    const status = respostas.map((r) => r.status).sort();
    assert.deepEqual(status, [201, 409, 409, 409, 409]);
    const { n } = await db.umaLinha("SELECT COUNT(*) AS n FROM agendamentos WHERE inicio = ? AND status = 'confirmado'", [new Date(alvo)]);
    assert.equal(n, 1);
  });

  it('serviço longo bloqueia o horário seguinte que se sobrepõe', async () => {
    const a = await novoCliente();
    const b = await novoCliente();
    const { horarios } = await diaAberto('corte-barba', 4);
    const base = horarios.find((h) => h.hora === '10:00') || horarios[4];
    assert.equal((await a.post('/api/agendamentos', { servico: 'corte-barba', inicio: base.inicio })).status, 201);
    const meia = new Date(new Date(base.inicio).getTime() + 30 * 60000).toISOString();
    assert.equal((await b.post('/api/agendamentos', { servico: 'corte-fortao', inicio: meia })).status, 409);
    const depois = new Date(new Date(base.inicio).getTime() + 60 * 60000).toISOString();
    assert.equal((await b.post('/api/agendamentos', { servico: 'corte-fortao', inicio: depois })).status, 201);
  });

  it('limita horários futuros por cliente', async () => {
    const c = await novoCliente();
    const { horarios } = await diaAberto('corte-fortao', 6);
    const livres = horarios.filter((_, i) => i % 6 === 0).slice(0, 4);
    for (let i = 0; i < 3; i++) assert.equal((await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: livres[i].inicio })).status, 201);
    const quarto = await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: livres[3].inicio });
    assert.equal(quarto.status, 409);
    assert.equal(quarto.body.codigo, 'limite_horarios');
  });

  it('cancela dentro do prazo e libera o horário; fora do prazo recusa', async () => {
    const c = await novoCliente();
    const { data, horarios } = await diaAberto('corte-sobrancelha', 7);
    const r = await c.post('/api/agendamentos', { servico: 'corte-sobrancelha', inicio: horarios[1].inicio });
    assert.equal(r.status, 201);
    assert.equal(r.body.agendamento.pode_alterar, true);
    const antes = (await request(app).get(`/api/horarios?servico=corte-sobrancelha&data=${data}`)).body.horarios.map((h) => h.inicio);
    assert.ok(!antes.includes(horarios[1].inicio));
    const cancel = await c.post(`/api/agendamentos/${r.body.agendamento.codigo}/cancelar`, {});
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.agendamento.status, 'cancelado');
    const depois = (await request(app).get(`/api/horarios?servico=corte-sobrancelha&data=${data}`)).body.horarios.map((h) => h.inicio);
    assert.ok(depois.includes(horarios[1].inicio));

    // Horário daqui a 1 h: fora do prazo de 2 h
    const em1h = new Date(Date.now() + 3600000);
    const { id } = await db.umaLinha("SELECT id FROM usuarios WHERE email = ?", [c.dados.email]);
    await db.consulta(
      "INSERT INTO agendamentos (codigo, cliente_id, cliente_nome, barbeiro_id, servico_id, servico_nome, preco_centavos, duracao_min, inicio, fim) VALUES ('PRAZO123', ?, 'x', 1, 1, 'Corte Fortão', 4000, 40, ?, ?)",
      [id, em1h, new Date(em1h.getTime() + 2400000)],
    );
    const tarde = await c.post('/api/agendamentos/PRAZO123/cancelar', {});
    assert.equal(tarde.status, 409);
    assert.equal(tarde.body.codigo, 'fora_do_prazo');
  });

  it('não deixa um cliente mexer no horário de outro', async () => {
    const dono = await novoCliente();
    const intruso = await novoCliente();
    const { horarios } = await diaAberto('corte-fortao', 8);
    const r = await dono.post('/api/agendamentos', { servico: 'corte-fortao', inicio: horarios[2].inicio });
    const codigo = r.body.agendamento.codigo;
    assert.equal((await intruso.post(`/api/agendamentos/${codigo}/cancelar`, {})).status, 404);
    assert.equal((await intruso.post(`/api/agendamentos/${codigo}/remarcar`, { inicio: horarios[5].inicio })).status, 404);
  });

  it('remarca: libera o antigo e ocupa o novo', async () => {
    const c = await novoCliente();
    const { data, horarios } = await diaAberto('corte-fortao', 9);
    const r = await c.post('/api/agendamentos', { servico: 'corte-fortao', inicio: horarios[0].inicio });
    const novo = horarios[8].inicio;
    const m = await c.post(`/api/agendamentos/${r.body.agendamento.codigo}/remarcar`, { inicio: novo });
    assert.equal(m.status, 200);
    assert.equal(m.body.agendamento.inicio, novo);
    const livres = (await request(app).get(`/api/horarios?servico=corte-fortao&data=${data}`)).body.horarios.map((h) => h.inicio);
    assert.ok(livres.includes(horarios[0].inicio));
    assert.ok(!livres.includes(novo));
  });

  it('bloqueio do Fortão tira os horários do dia', async () => {
    const admin = await novoAdmin();
    const { data } = await diaAberto('corte-fortao', 10);
    const r = await admin.post('/api/admin/bloqueios', { data, dia_inteiro: true, motivo: 'Corrida de rua' });
    assert.equal(r.status, 201);
    const livres = (await request(app).get(`/api/horarios?servico=corte-fortao&data=${data}`)).body.horarios;
    assert.equal(livres.length, 0);
    await admin.del(`/api/admin/bloqueios/${r.body.id}`);
    assert.ok((await request(app).get(`/api/horarios?servico=corte-fortao&data=${data}`)).body.horarios.length > 0);
  });

  it('recusa data fora da janela de 30 dias', async () => {
    const r = await request(app).get('/api/horarios?servico=corte-fortao&data=2099-01-05');
    assert.equal(r.status, 400);
    assert.equal(r.body.codigo, 'fora_da_janela');
  });
});
