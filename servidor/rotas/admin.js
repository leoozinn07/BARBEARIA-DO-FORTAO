// Painel do Fortão. Toda rota exige papel admin e as ações ficam na auditoria.
import { Router } from 'express';
import { FUSO } from '../config.js';
import { PG, consulta, executar, umaLinha, transacao } from '../db/index.js';
import { smtpConfigurado } from '../emails/fila.js';
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
  const linhas = await consulta(`${SELECT_AGENDA} WHERE a.inicio >= $1 AND a.inicio < $2 ORDER BY a.inicio`, [
    tempo.limitesDoDia(de).de, tempo.limitesDoDia(ate).ate,
  ]);
  const bloqueios = await consulta('SELECT id, inicio, fim, motivo FROM bloqueios WHERE inicio < $1 AND fim > $2 ORDER BY inicio', [
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
            COALESCE(SUM(preco_centavos) FILTER (WHERE status IN ('confirmado', 'concluido')), 0) AS previsto_centavos,
            COALESCE(SUM(preco_centavos) FILTER (WHERE status = 'concluido'), 0) AS realizado_centavos,
            COUNT(*) FILTER (WHERE status = 'faltou') AS faltas,
            COUNT(*) FILTER (WHERE status = 'cancelado') AS cancelados
       FROM agendamentos WHERE inicio >= $1 AND inicio < $2`,
    [de, ate],
  );
  const [doDia, daSemana, doMes, clientes] = await Promise.all([
    contar(dia.de, dia.ate),
    contar(dia.de, semanaFim),
    contar(mesInicio, dia.ate),
    umaLinha("SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'cliente' AND excluido_em IS NULL"),
  ]);
  res.set('Cache-Control', 'no-store').json({
    data: hoje, dia: doDia, semana: daSemana, mes: doMes, clientes: clientes.total,
    // Sem SMTP, os e-mails não saem de verdade: o painel mostra o aviso
    email_real: smtpConfigurado(),
  });
}));

// ------------------------------------------------------------------ rendimento
// O que entrou (concluído), o que ainda vai entrar (confirmado) e o que se perdeu com faltas.
// O preço vem de cada agendamento, copiado na hora da marcação: mudar a tabela de preços não reescreve o passado.
const MAX_DIAS_RENDIMENTO = 366;
const SOMAS = `
  COALESCE(SUM(a.preco_centavos) FILTER (WHERE a.status = 'concluido'), 0) AS realizado_centavos,
  COUNT(*) FILTER (WHERE a.status = 'concluido') AS atendimentos,
  COALESCE(SUM(a.preco_centavos) FILTER (WHERE a.status = 'confirmado'), 0) AS a_receber_centavos,
  COUNT(*) FILTER (WHERE a.status = 'confirmado') AS agendados`;

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

/** Todos os dias (ou meses) do período, para o gráfico não pular os vazios. */
function periodos(de, ate, porMes) {
  const lista = [];
  if (porMes) {
    for (let p = `${de.slice(0, 7)}-01`; p <= ate; ) {
      lista.push(p);
      const [a, m] = p.split('-').map(Number);
      p = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
    }
  } else {
    for (let p = de; p <= ate; p = tempo.somarDias(p, 1)) lista.push(p);
  }
  return lista;
}

rotasAdmin.get('/rendimento', validar(z.object({ de: campos.dataISO, ate: campos.dataISO }), 'query'), rota(async (req, res) => {
  const { de, ate } = req.dados;
  if (!tempo.dataISOValida(de) || !tempo.dataISOValida(ate) || ate < de || diasEntre(de, ate) >= MAX_DIAS_RENDIMENTO) {
    throw erros.validacao({ ate: 'Escolha um período de até 1 ano.' });
  }
  const dias = diasEntre(de, ate) + 1;
  const porMes = dias > 62;
  const inicio = tempo.limitesDoDia(de).de;
  const fim = tempo.limitesDoDia(ate).ate;
  // Comparação justa: se o período ainda não acabou (ex.: "este mês"), compara só os dias que já passaram
  // com o mesmo número de dias logo antes do período.
  // Mês fechado (dia 1 ao último dia) compara com o mês anterior: 1 a 13 de outubro contra 1 a 13 de setembro.
  const hoje = tempo.dataLocalISO(new Date());
  const corridos = ate > hoje && hoje >= de ? diasEntre(de, hoje) + 1 : dias;
  const mesInteiro = de.endsWith('-01') && tempo.somarDias(ate, 1).endsWith('-01') && de.slice(0, 7) === ate.slice(0, 7);
  let anteriorDe;
  let anteriorAte;
  if (mesInteiro) {
    anteriorDe = `${tempo.somarDias(de, -1).slice(0, 7)}-01`;
    const fimMesAnterior = tempo.somarDias(de, -1);
    anteriorAte = [tempo.somarDias(anteriorDe, corridos - 1), fimMesAnterior].sort()[0];
  } else {
    anteriorDe = tempo.somarDias(de, -dias);
    anteriorAte = tempo.somarDias(anteriorDe, corridos - 1);
  }

  const [totais, faltas, anterior, porServico, serie] = await Promise.all([
    umaLinha(`SELECT ${SOMAS} FROM agendamentos a WHERE a.inicio >= $1 AND a.inicio < $2`, [inicio, fim]),
    umaLinha(
      `SELECT COUNT(*) FILTER (WHERE status = 'faltou') AS faltas,
              COALESCE(SUM(preco_centavos) FILTER (WHERE status = 'faltou'), 0) AS faltas_centavos,
              COUNT(*) FILTER (WHERE status = 'cancelado') AS cancelados
         FROM agendamentos WHERE inicio >= $1 AND inicio < $2`,
      [inicio, fim],
    ),
    umaLinha(`SELECT ${SOMAS} FROM agendamentos a WHERE a.inicio >= $1 AND a.inicio < $2`, [tempo.limitesDoDia(anteriorDe).de, tempo.limitesDoDia(anteriorAte).ate]),
    consulta(
      `SELECT s.nome AS servico, ${SOMAS}
         FROM agendamentos a JOIN servicos s ON s.id = a.servico_id
        WHERE a.inicio >= $1 AND a.inicio < $2 AND a.status IN ('concluido', 'confirmado')
        GROUP BY s.id, s.nome ORDER BY realizado_centavos DESC, a_receber_centavos DESC`,
      [inicio, fim],
    ),
    consulta(
      `SELECT to_char(date_trunc($3, a.inicio AT TIME ZONE $4), 'YYYY-MM-DD') AS periodo, ${SOMAS}
         FROM agendamentos a WHERE a.inicio >= $1 AND a.inicio < $2
        GROUP BY 1 ORDER BY 1`,
      [inicio, fim, porMes ? 'month' : 'day', FUSO],
    ),
  ]);

  const doPeriodo = new Map(serie.map((l) => [l.periodo, l]));
  res.set('Cache-Control', 'no-store').json({
    de,
    ate,
    agrupado_por: porMes ? 'mes' : 'dia',
    totais: {
      ...totais,
      ...faltas,
      ticket_medio_centavos: totais.atendimentos ? Math.round(totais.realizado_centavos / totais.atendimentos) : 0,
    },
    anterior: { de: anteriorDe, ate: anteriorAte, realizado_centavos: anterior.realizado_centavos, atendimentos: anterior.atendimentos },
    por_servico: porServico,
    serie: periodos(de, ate, porMes).map((p) => ({
      periodo: p,
      realizado_centavos: doPeriodo.get(p)?.realizado_centavos ?? 0,
      a_receber_centavos: doPeriodo.get(p)?.a_receber_centavos ?? 0,
      atendimentos: doPeriodo.get(p)?.atendimentos ?? 0,
      agendados: doPeriodo.get(p)?.agendados ?? 0,
    })),
  });
}));

// Horários livres para o admin (sem a antecedência mínima)
rotasAdmin.get('/horarios', validar(z.object({ servico: campos.slug, data: campos.dataISO, ignorar: campos.codigo.optional() }), 'query'), rota(async (req, res) => {
  let ignorarId = null;
  if (req.dados.ignorar) ignorarId = (await umaLinha('SELECT id FROM agendamentos WHERE codigo = $1', [req.dados.ignorar]))?.id ?? null;
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
    cliente = await umaLinha("SELECT id, nome, telefone FROM usuarios WHERE email = $1 AND excluido_em IS NULL AND papel = 'cliente'", [d.email_cliente]);
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
  res.json({ agendamento: paraAdmin(await buscarAgendamento('a.id = $1', [ag.id])) });
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
    "SELECT codigo, cliente_nome, inicio FROM agendamentos WHERE barbeiro_id = $1 AND status = 'confirmado' AND inicio < $2 AND fim > $3",
    [barbeiroId, fim, inicio],
  );
  const { id } = await umaLinha('INSERT INTO bloqueios (barbeiro_id, inicio, fim, motivo, criado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
    barbeiroId, inicio, fim, d.motivo, req.usuario.id,
  ]);
  await registrar(req, 'admin_bloqueou', String(id), { data: d.data });
  // O bloqueio não cancela ninguém sozinho: o painel mostra quem já estava marcado para o Fortão decidir
  res.status(201).json({ id, conflitos: conflitos.map((c) => ({ codigo: c.codigo, cliente: c.cliente_nome, inicio: c.inicio })) });
}));

rotasAdmin.delete('/bloqueios/:id', validar(z.object({ id: z.coerce.number().int().positive() }), 'params'), rota(async (req, res) => {
  if (!(await executar('DELETE FROM bloqueios WHERE id = $1', [req.dados.id]))) throw erros.naoEncontrado('Bloqueio não encontrado.');
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
    const { id } = await umaLinha('INSERT INTO servicos (slug, nome, descricao, preco_centavos, duracao_min, ativo, ordem) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [
      d.slug, d.nome, d.descricao, d.preco_centavos, d.duracao_min, d.ativo, d.ordem,
    ]);
    await registrar(req, 'admin_criou_servico', d.slug);
    res.status(201).json({ id });
  } catch (e) {
    if (e.code === PG.unico) throw erros.validacao({ nome: 'Já existe um serviço com esse nome.' });
    throw e;
  }
}));

rotasAdmin.put('/servicos/:id', validar(z.object({ id: z.coerce.number().int().positive() }), 'params'), rota(async (req, res) => {
  const r = esquemaServico.safeParse(req.body);
  if (!r.success) throw erros.validacao({ servico: 'Dados do serviço inválidos.' });
  const d = r.data;
  const mudou = await executar('UPDATE servicos SET nome = $1, descricao = $2, preco_centavos = $3, duracao_min = $4, ativo = $5, ordem = $6 WHERE id = $7', [
    d.nome, d.descricao, d.preco_centavos, d.duracao_min, d.ativo, d.ordem, req.dados.id,
  ]);
  if (!mudou) throw erros.naoEncontrado('Serviço não encontrado.');
  await registrar(req, 'admin_editou_servico', String(req.dados.id), d);
  res.json({ ok: true });
}));

// Serviço que nunca foi marcado pode sumir de vez. Com histórico, ele só fica oculto: o rendimento antigo continua certo.
rotasAdmin.delete('/servicos/:id', validar(z.object({ id: z.coerce.number().int().positive() }), 'params'), rota(async (req, res) => {
  const usado = await umaLinha('SELECT 1 FROM agendamentos WHERE servico_id = $1 LIMIT 1', [req.dados.id]);
  if (usado) {
    throw erros.conflito('Esse serviço já tem horários no histórico. Desmarque "Aparece para os clientes" para escondê-lo.', 'servico_com_historico');
  }
  if (!(await executar('DELETE FROM servicos WHERE id = $1', [req.dados.id]))) throw erros.naoEncontrado('Serviço não encontrado.');
  await registrar(req, 'admin_removeu_servico', String(req.dados.id));
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ horário de funcionamento
const esquemaFuncionamento = z.object({
  faixas: z.array(z.object({ dia_semana: z.number().int().min(0).max(6), abre: campos.hora, fecha: campos.hora }).refine((f) => f.abre < f.fecha, { message: 'Abertura precisa ser antes do fechamento.' })).max(21),
});

rotasAdmin.get('/funcionamento', rota(async (_req, res) => {
  const barbeiroId = await barbeiroPadrao();
  const faixas = await consulta(
    "SELECT dia_semana, to_char(abre, 'HH24:MI') AS abre, to_char(fecha, 'HH24:MI') AS fecha FROM horarios_funcionamento WHERE barbeiro_id = $1 ORDER BY dia_semana, abre",
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
    await executar('DELETE FROM horarios_funcionamento WHERE barbeiro_id = $1', [barbeiroId], conn);
    for (const f of req.dados.faixas) {
      await executar('INSERT INTO horarios_funcionamento (barbeiro_id, dia_semana, abre, fecha) VALUES ($1, $2, $3, $4)', [barbeiroId, f.dia_semana, f.abre, f.fecha], conn);
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
            COUNT(a.id) AS total, COUNT(*) FILTER (WHERE a.status = 'concluido') AS concluidos,
            COUNT(*) FILTER (WHERE a.status = 'faltou') AS faltas, MAX(a.inicio) AS ultimo,
            COALESCE(SUM(a.preco_centavos) FILTER (WHERE a.status = 'concluido'), 0) AS gasto_centavos
       FROM usuarios u LEFT JOIN agendamentos a ON a.cliente_id = u.id AND a.status = ANY($1::text[])
      WHERE u.papel = 'cliente' AND u.excluido_em IS NULL AND (u.nome ILIKE $2 OR u.email ILIKE $2 OR u.telefone ILIKE $2)
      GROUP BY u.id ORDER BY ultimo DESC NULLS LAST, u.criado_em DESC LIMIT 100`,
    [STATUS_OCUPA, q],
  );
  res.set('Cache-Control', 'no-store').json({ clientes });
}));
