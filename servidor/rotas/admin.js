// Painel do Fortão. Toda rota exige papel admin e as ações ficam na auditoria.
import { Router } from 'express';
import { consulta, umaLinha, transacao } from '../db/index.js';
import { erros } from '../lib/erros.js';
import * as tempo from '../lib/tempo.js';
import { campos, validar, z } from '../lib/validacao.js';
import { exigirAdmin } from '../middlewares/sessao.js';
import {
  STATUS_OCUPA, barbeiroPadrao, buscarAgendamento, cancelarAgendamento, criarAgendamento, definirStatus,
  horariosDoDia, paraAdmin, remarcarAgendamento,
} from '../servicos/agenda.js';
import { auditar } from '../servicos/auditoria.js';
import { lerConfiguracoes, salvarConfiguracao } from '../servicos/configuracoes.js';
import { rota } from './comum.js';

export const rotasAdmin = Router();
rotasAdmin.use(exigirAdmin);

const registrar = (req, acao, alvo, detalhes) => auditar({ usuarioId: req.usuario.id, acao, alvo, detalhes, ip: req.ip });

const SELECT_AGENDA = 'SELECT a.*, u.email AS cliente_email, s.slug AS servico_slug FROM agendamentos a LEFT JOIN usuarios u ON u.id = a.cliente_id JOIN servicos s ON s.id = a.servico_id';

// ------------------------------------------------------------------ agenda e resumo
rotasAdmin.get('/agenda', validar(z.object({ de: campos.dataISO, ate: campos.dataISO.optional() }), 'query'), rota(async (req, res) => {
  const de = req.dados.de;
  const ate = req.dados.ate ?? de;
  if (ate < de || tempo.somarDias(de, 62) < ate) throw erros.validacao({ ate: 'Período inválido (máximo de 62 dias).' });
  const linhas = await consulta(`${SELECT_AGENDA} WHERE a.inicio >= ? AND a.inicio < ? ORDER BY a.inicio`, [
    tempo.limitesDoDia(de).de, tempo.limitesDoDia(ate).ate,
  ]);
  const bloqueios = await consulta('SELECT id, inicio, fim, motivo FROM bloqueios WHERE inicio < ? AND fim > ? ORDER BY inicio', [
    tempo.limitesDoDia(ate).ate, tempo.limitesDoDia(de).de,
  ]);
  res.set('Cache-Control', 'no-store').json({ agendamentos: linhas.map(paraAdmin), bloqueios });
}));

rotasAdmin.get('/resumo', validar(z.object({ data: campos.dataISO.optional() }), 'query'), rota(async (req, res) => {
  const hoje = req.dados.data ?? tempo.dataLocalISO(new Date());
  const dia = tempo.limitesDoDia(hoje);
  const semanaFim = tempo.limitesDoDia(tempo.somarDias(hoje, 6)).ate;
  const mesInicio = tempo.limitesDoDia(`${hoje.slice(0, 7)}-01`).de;
  const contar = (de, ate) => umaLinha(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status IN ('confirmado','concluido') THEN preco_centavos END), 0) AS previsto_centavos,
            COALESCE(SUM(CASE WHEN status = 'concluido' THEN preco_centavos END), 0) AS realizado_centavos,
            SUM(status = 'faltou') AS faltas, SUM(status = 'cancelado') AS cancelados
       FROM agendamentos WHERE inicio >= ? AND inicio < ?`,
    [de, ate],
  );
  const [doDia, daSemana, doMes, clientes] = await Promise.all([
    contar(dia.de, dia.ate),
    contar(dia.de, semanaFim),
    contar(mesInicio, dia.ate),
    umaLinha("SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'cliente' AND excluido_em IS NULL"),
  ]);
  const normalizar = (l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, Number(v ?? 0)]));
  res.set('Cache-Control', 'no-store').json({ data: hoje, dia: normalizar(doDia), semana: normalizar(daSemana), mes: normalizar(doMes), clientes: Number(clientes.total) });
}));

// Horários livres para o admin (sem a antecedência mínima)
rotasAdmin.get('/horarios', validar(z.object({ servico: campos.slug, data: campos.dataISO, ignorar: campos.codigo.optional() }), 'query'), rota(async (req, res) => {
  let ignorarId = null;
  if (req.dados.ignorar) ignorarId = (await umaLinha('SELECT id FROM agendamentos WHERE codigo = ?', [req.dados.ignorar]))?.id ?? null;
  const { horarios } = await horariosDoDia({ slug: req.dados.servico, dataISO: req.dados.data, ignorarId, semAntecedencia: true });
  res.set('Cache-Control', 'no-store').json({ horarios });
}));

// ------------------------------------------------------------------ ações nos agendamentos
const esquemaNovo = z.object({
  servico: campos.slug,
  inicio: campos.instante,
  email_cliente: campos.email.optional(),
  nome: campos.nome.optional(),
  telefone: campos.telefone,
  observacao: z.string().trim().max(255).optional(),
}).refine((d) => d.email_cliente || d.nome, { message: 'Informe o nome do cliente ou o e-mail de uma conta.', path: ['nome'] });

rotasAdmin.post('/agendamentos', validar(esquemaNovo), rota(async (req, res) => {
  const d = req.dados;
  let cliente = null;
  if (d.email_cliente) {
    cliente = await umaLinha("SELECT id, nome, telefone FROM usuarios WHERE email = ? AND excluido_em IS NULL AND papel = 'cliente'", [d.email_cliente]);
    if (!cliente) throw erros.validacao({ email_cliente: 'Nenhuma conta com esse e-mail.' });
  }
  const ag = await criarAgendamento({
    cliente,
    avulso: cliente ? null : { nome: d.nome, telefone: d.telefone ?? null },
    slug: d.servico,
    inicio: d.inicio,
    origem: 'admin',
    observacao: d.observacao || null,
  });
  await registrar(req, 'admin_criou_agendamento', ag.codigo);
  res.status(201).json({ agendamento: paraAdmin(ag) });
}));

const porCodigo = validar(z.object({ codigo: campos.codigo }), 'params');

rotasAdmin.post('/agendamentos/:codigo/status', porCodigo, rota(async (req, res) => {
  const r = z.object({ status: z.enum(['concluido', 'faltou', 'confirmado']) }).safeParse(req.body);
  if (!r.success) throw erros.validacao({ status: 'Status inválido.' });
  const ag = await definirStatus({ codigo: req.dados.codigo, status: r.data.status });
  await registrar(req, 'admin_status', ag.codigo, { status: r.data.status });
  res.json({ agendamento: paraAdmin(ag) });
}));

rotasAdmin.post('/agendamentos/:codigo/cancelar', porCodigo, rota(async (req, res) => {
  const r = z.object({ motivo: z.string().trim().max(255).optional() }).safeParse(req.body ?? {});
  if (!r.success) throw erros.validacao({ motivo: 'Motivo muito longo.' });
  const ag = await cancelarAgendamento({ codigo: req.dados.codigo, porAdmin: true, motivo: r.data.motivo || null });
  await registrar(req, 'admin_cancelou', ag.codigo);
  res.json({ agendamento: paraAdmin(await buscarAgendamento('a.id = ?', [ag.id])) });
}));

rotasAdmin.post('/agendamentos/:codigo/remarcar', porCodigo, rota(async (req, res) => {
  const r = z.object({ inicio: campos.instante }).safeParse(req.body);
  if (!r.success) throw erros.validacao({ inicio: 'Horário inválido.' });
  const ag = await remarcarAgendamento({ codigo: req.dados.codigo, inicio: r.data.inicio, porAdmin: true });
  await registrar(req, 'admin_remarcou', ag.codigo);
  res.json({ agendamento: paraAdmin(ag) });
}));

// ------------------------------------------------------------------ bloqueios (folga, compromisso)
const esquemaBloqueio = z.object({
  data: campos.dataISO,
  dia_inteiro: z.boolean().optional().default(false),
  de: campos.hora.optional(),
  ate: campos.hora.optional(),
  motivo: z.string().trim().max(160).optional().default(''),
}).refine((d) => d.dia_inteiro || (d.de && d.ate && d.de < d.ate), { message: 'Informe o horário de início e de fim.', path: ['ate'] });

rotasAdmin.post('/bloqueios', validar(esquemaBloqueio), rota(async (req, res) => {
  const d = req.dados;
  const inicio = d.dia_inteiro ? tempo.localParaUtc(d.data, 0) : tempo.localParaUtc(d.data, tempo.horaParaMinutos(d.de));
  const fim = d.dia_inteiro ? tempo.localParaUtc(tempo.somarDias(d.data, 1), 0) : tempo.localParaUtc(d.data, tempo.horaParaMinutos(d.ate));
  const barbeiroId = await barbeiroPadrao();
  const conflitos = await consulta(
    "SELECT codigo, cliente_nome, inicio FROM agendamentos WHERE barbeiro_id = ? AND status = 'confirmado' AND inicio < ? AND fim > ?",
    [barbeiroId, fim, inicio],
  );
  const r = await consulta('INSERT INTO bloqueios (barbeiro_id, inicio, fim, motivo, criado_por) VALUES (?, ?, ?, ?, ?)', [
    barbeiroId, inicio, fim, d.motivo, req.usuario.id,
  ]);
  await registrar(req, 'admin_bloqueou', String(r.insertId), { data: d.data });
  // O bloqueio não cancela ninguém sozinho: o painel mostra quem já estava marcado para o Fortão decidir
  res.status(201).json({ id: r.insertId, conflitos: conflitos.map((c) => ({ codigo: c.codigo, cliente: c.cliente_nome, inicio: c.inicio })) });
}));

rotasAdmin.delete('/bloqueios/:id', validar(z.object({ id: z.coerce.number().int().positive() }), 'params'), rota(async (req, res) => {
  const r = await consulta('DELETE FROM bloqueios WHERE id = ?', [req.dados.id]);
  if (!r.affectedRows) throw erros.naoEncontrado('Bloqueio não encontrado.');
  await registrar(req, 'admin_desbloqueou', String(req.dados.id));
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ serviços
const esquemaServico = z.object({
  nome: z.string().trim().min(2).max(80),
  descricao: z.string().trim().max(255).optional().default(''),
  preco_centavos: z.number().int().min(0).max(1_000_000),
  duracao_min: z.number().int().min(10).max(480),
  ativo: z.boolean().optional().default(true),
  ordem: z.number().int().min(0).max(999).optional().default(0),
});

rotasAdmin.get('/servicos', rota(async (_req, res) => {
  res.json({ servicos: await consulta('SELECT id, slug, nome, descricao, preco_centavos, duracao_min, ativo, ordem FROM servicos ORDER BY ordem, id') });
}));

rotasAdmin.post('/servicos', validar(esquemaServico.extend({ slug: campos.slug })), rota(async (req, res) => {
  const d = req.dados;
  try {
    const r = await consulta('INSERT INTO servicos (slug, nome, descricao, preco_centavos, duracao_min, ativo, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      d.slug, d.nome, d.descricao, d.preco_centavos, d.duracao_min, d.ativo ? 1 : 0, d.ordem,
    ]);
    await registrar(req, 'admin_criou_servico', d.slug);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw erros.validacao({ slug: 'Já existe um serviço com esse identificador.' });
    throw e;
  }
}));

rotasAdmin.put('/servicos/:id', validar(z.object({ id: z.coerce.number().int().positive() }), 'params'), rota(async (req, res) => {
  const r = esquemaServico.safeParse(req.body);
  if (!r.success) throw erros.validacao({ servico: 'Dados do serviço inválidos.' });
  const d = r.data;
  const out = await consulta('UPDATE servicos SET nome = ?, descricao = ?, preco_centavos = ?, duracao_min = ?, ativo = ?, ordem = ? WHERE id = ?', [
    d.nome, d.descricao, d.preco_centavos, d.duracao_min, d.ativo ? 1 : 0, d.ordem, req.dados.id,
  ]);
  if (!out.affectedRows) throw erros.naoEncontrado('Serviço não encontrado.');
  await registrar(req, 'admin_editou_servico', String(req.dados.id), d);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ horário de funcionamento
const esquemaFuncionamento = z.object({
  faixas: z.array(z.object({ dia_semana: z.number().int().min(0).max(6), abre: campos.hora, fecha: campos.hora }).refine((f) => f.abre < f.fecha, { message: 'Abertura precisa ser antes do fechamento.' })).max(21),
});

rotasAdmin.get('/funcionamento', rota(async (_req, res) => {
  const barbeiroId = await barbeiroPadrao();
  const faixas = await consulta(
    "SELECT dia_semana, TIME_FORMAT(abre, '%H:%i') AS abre, TIME_FORMAT(fecha, '%H:%i') AS fecha FROM horarios_funcionamento WHERE barbeiro_id = ? ORDER BY dia_semana, abre",
    [barbeiroId],
  );
  res.json({ faixas });
}));

rotasAdmin.put('/funcionamento', validar(esquemaFuncionamento), rota(async (req, res) => {
  const barbeiroId = await barbeiroPadrao();
  // Faixas do mesmo dia não podem se sobrepor
  const porDia = new Map();
  for (const f of req.dados.faixas) {
    const lista = porDia.get(f.dia_semana) || [];
    if (lista.some((g) => f.abre < g.fecha && f.fecha > g.abre)) throw erros.validacao({ faixas: 'Há faixas sobrepostas no mesmo dia.' });
    lista.push(f);
    porDia.set(f.dia_semana, lista);
  }
  await transacao(async (conn) => {
    await consulta('DELETE FROM horarios_funcionamento WHERE barbeiro_id = ?', [barbeiroId], conn);
    for (const f of req.dados.faixas) {
      await consulta('INSERT INTO horarios_funcionamento (barbeiro_id, dia_semana, abre, fecha) VALUES (?, ?, ?, ?)', [barbeiroId, f.dia_semana, f.abre, f.fecha], conn);
    }
  });
  await registrar(req, 'admin_funcionamento', null, { faixas: req.dados.faixas.length });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ dados da barbearia e regras
const esquemaConfig = z.object({
  negocio: z.object({
    nome: z.string().trim().min(2).max(80),
    endereco: z.string().trim().max(160),
    bairro: z.string().trim().max(80),
    cidade: z.string().trim().max(80),
    uf: z.string().trim().length(2).toUpperCase(),
    whatsapp: z.string().trim().transform((s) => s.replace(/\D/g, '')).refine((s) => s === '' || /^\d{10,13}$/.test(s), 'WhatsApp com DDD.'),
    instagram: z.string().trim().max(60).transform((s) => s.replace(/^@/, '')),
    email_contato: z.union([z.literal(''), campos.email]),
    razao_social: z.string().trim().max(160),
    cnpj: z.string().trim().max(20),
    encarregado_email: z.union([z.literal(''), campos.email]),
  }).partial(),
  agenda: z.object({
    antecedencia_min: z.number().int().min(0).max(1440),
    janela_dias: z.number().int().min(1).max(120),
    passo_min: z.number().int().min(5).max(120),
    cancelar_ate_horas: z.number().int().min(0).max(72),
    max_futuros_por_cliente: z.number().int().min(1).max(20),
  }).partial(),
}).partial();

rotasAdmin.get('/config', rota(async (_req, res) => {
  res.set('Cache-Control', 'no-store').json(await lerConfiguracoes());
}));

rotasAdmin.put('/config', validar(esquemaConfig), rota(async (req, res) => {
  const atual = await lerConfiguracoes();
  if (req.dados.negocio) await salvarConfiguracao('negocio', { ...atual.negocio, ...req.dados.negocio });
  if (req.dados.agenda) await salvarConfiguracao('agenda', { ...atual.agenda, ...req.dados.agenda });
  await registrar(req, 'admin_config', null, { chaves: Object.keys(req.dados) });
  res.json(await lerConfiguracoes());
}));

// ------------------------------------------------------------------ clientes
rotasAdmin.get('/clientes', validar(z.object({ q: z.string().trim().max(80).optional() }), 'query'), rota(async (req, res) => {
  const q = req.dados.q ? `%${req.dados.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : '%';
  const clientes = await consulta(
    `SELECT u.id, u.nome, u.email, u.telefone, u.email_verificado_em IS NOT NULL AS verificado, u.criado_em,
            COUNT(a.id) AS total, SUM(a.status = 'concluido') AS concluidos, SUM(a.status = 'faltou') AS faltas, MAX(a.inicio) AS ultimo
       FROM usuarios u LEFT JOIN agendamentos a ON a.cliente_id = u.id AND a.status IN (?)
      WHERE u.papel = 'cliente' AND u.excluido_em IS NULL AND (u.nome LIKE ? OR u.email LIKE ? OR u.telefone LIKE ?)
      GROUP BY u.id ORDER BY ultimo IS NULL, ultimo DESC, u.criado_em DESC LIMIT 100`,
    [STATUS_OCUPA, q, q, q],
  );
  res.set('Cache-Control', 'no-store').json({
    clientes: clientes.map((c) => ({ ...c, verificado: Boolean(c.verificado), total: Number(c.total), concluidos: Number(c.concluidos ?? 0), faltas: Number(c.faltas ?? 0) })),
  });
}));
