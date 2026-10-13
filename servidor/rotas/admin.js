// Painel do Fortão. Toda rota exige papel admin e as ações ficam na auditoria.
import { Router } from 'express';
import { consulta, executar, umaLinha, transacao } from '../db/index.js';
import { smtpConfigurado } from '../emails/fila.js';
import { erros } from '../lib/erros.js';
import * as tempo from '../lib/tempo.js';
import { campos, validar, z } from '../lib/validacao.js';
import { exigirAdmin } from '../middlewares/sessao.js';
import {
  STATUS_OCUPA, anexarAdicionais, barbeiroPadrao, buscarAgendamento, cancelarAgendamento, criarAgendamento, definirStatus,
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
  await anexarAdicionais(linhas);
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
  res.set('Cache-Control', 'no-store').json({
    data: hoje, dia: normalizar(doDia), semana: normalizar(daSemana), mes: normalizar(doMes), clientes: Number(clientes.total),
    // Sem SMTP, os e-mails não saem de verdade: o painel mostra o aviso
    email_real: smtpConfigurado(),
  });
}));

// ------------------------------------------------------------------ rendimento
// O que entrou (concluído), o que ainda vai entrar (confirmado) e o que se perdeu com faltas.
// O preço vem de cada agendamento, copiado na hora da marcação: mudar a tabela de preços não reescreve o passado.
// A soma é feita aqui, no horário de São Paulo, sem depender das tabelas de fuso do MySQL.
const MAX_DIAS_RENDIMENTO = 366;
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

function somar(lista) {
  const t = { realizado_centavos: 0, atendimentos: 0, a_receber_centavos: 0, agendados: 0, faltas: 0, faltas_centavos: 0, cancelados: 0 };
  for (const a of lista) {
    if (a.status === 'concluido') { t.realizado_centavos += a.preco_centavos; t.atendimentos++; }
    else if (a.status === 'confirmado') { t.a_receber_centavos += a.preco_centavos; t.agendados++; }
    else if (a.status === 'faltou') { t.faltas_centavos += a.preco_centavos; t.faltas++; }
    else if (a.status === 'cancelado') t.cancelados++;
  }
  return t;
}

rotasAdmin.get('/rendimento', validar(z.object({ de: campos.dataISO, ate: campos.dataISO }), 'query'), rota(async (req, res) => {
  const { de, ate } = req.dados;
  if (!tempo.dataISOValida(de) || !tempo.dataISOValida(ate) || ate < de || diasEntre(de, ate) >= MAX_DIAS_RENDIMENTO) {
    throw erros.validacao({ ate: 'Escolha um período de até 1 ano.' });
  }
  const dias = diasEntre(de, ate) + 1;
  const porMes = dias > 62;

  // Comparação justa: se o período ainda não acabou (ex.: "este mês"), compara só os dias que já passaram.
  // Mês inteiro compara com o mês anterior: 1 a 13 de outubro contra 1 a 13 de setembro.
  const hoje = tempo.dataLocalISO(new Date());
  const corridos = ate > hoje && hoje >= de ? diasEntre(de, hoje) + 1 : dias;
  const mesInteiro = de.endsWith('-01') && tempo.somarDias(ate, 1).endsWith('-01') && de.slice(0, 7) === ate.slice(0, 7);
  let anteriorDe;
  let anteriorAte;
  if (mesInteiro) {
    anteriorDe = `${tempo.somarDias(de, -1).slice(0, 7)}-01`;
    anteriorAte = [tempo.somarDias(anteriorDe, corridos - 1), tempo.somarDias(de, -1)].sort()[0];
  } else {
    anteriorDe = tempo.somarDias(de, -dias);
    anteriorAte = tempo.somarDias(anteriorDe, corridos - 1);
  }

  const [linhas, extras, anteriores] = await Promise.all([
    consulta(
      `SELECT a.id, a.inicio, a.status, a.preco_centavos, a.servico_id, s.nome AS servico
         FROM agendamentos a JOIN servicos s ON s.id = a.servico_id
        WHERE a.inicio >= ? AND a.inicio < ?`,
      [tempo.limitesDoDia(de).de, tempo.limitesDoDia(ate).ate],
    ),
    consulta(
      `SELECT aa.agendamento_id, aa.servico_id, aa.preco_centavos, s.nome
         FROM agendamento_adicionais aa JOIN agendamentos a ON a.id = aa.agendamento_id JOIN servicos s ON s.id = aa.servico_id
        WHERE a.inicio >= ? AND a.inicio < ?`,
      [tempo.limitesDoDia(de).de, tempo.limitesDoDia(ate).ate],
    ),
    consulta(
      "SELECT status, preco_centavos FROM agendamentos WHERE status = 'concluido' AND inicio >= ? AND inicio < ?",
      [tempo.limitesDoDia(anteriorDe).de, tempo.limitesDoDia(anteriorAte).ate],
    ),
  ]);

  const totais = somar(linhas);
  const anterior = somar(anteriores);

  // Por serviço: o corte entra com o preço dele e cada adicional (luzes, boyzão...) aparece numa linha própria
  const extrasDe = new Map();
  for (const e of extras) {
    if (!extrasDe.has(e.agendamento_id)) extrasDe.set(e.agendamento_id, []);
    extrasDe.get(e.agendamento_id).push(e);
  }
  const servicos = new Map();
  const somarEm = (chave, servico, item) => {
    if (!servicos.has(chave)) servicos.set(chave, { servico, lista: [] });
    servicos.get(chave).lista.push(item);
  };
  const grupos = new Map();
  for (const a of linhas) {
    if (a.status === 'concluido' || a.status === 'confirmado') {
      const doHorario = extrasDe.get(a.id) || [];
      const base = a.preco_centavos - doHorario.reduce((t, e) => t + e.preco_centavos, 0);
      somarEm(`s${a.servico_id}`, a.servico, { status: a.status, preco_centavos: base });
      for (const e of doHorario) somarEm(`a${e.servico_id}`, `${e.nome} (adicional)`, { status: a.status, preco_centavos: e.preco_centavos });
    }
    const dia = tempo.dataLocalISO(new Date(a.inicio));
    const chave = porMes ? `${dia.slice(0, 7)}-01` : dia;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(a);
  }
  const porServico = [...servicos.values()]
    .map(({ servico, lista }) => {
      const t = somar(lista);
      return { servico, realizado_centavos: t.realizado_centavos, atendimentos: t.atendimentos, a_receber_centavos: t.a_receber_centavos, agendados: t.agendados };
    })
    .sort((x, y) => y.realizado_centavos - x.realizado_centavos || y.a_receber_centavos - x.a_receber_centavos);

  res.set('Cache-Control', 'no-store').json({
    de,
    ate,
    agrupado_por: porMes ? 'mes' : 'dia',
    totais: { ...totais, ticket_medio_centavos: totais.atendimentos ? Math.round(totais.realizado_centavos / totais.atendimentos) : 0 },
    anterior: { de: anteriorDe, ate: anteriorAte, realizado_centavos: anterior.realizado_centavos, atendimentos: anterior.atendimentos },
    por_servico: porServico,
    serie: periodos(de, ate, porMes).map((p) => {
      const t = somar(grupos.get(p) || []);
      return { periodo: p, realizado_centavos: t.realizado_centavos, a_receber_centavos: t.a_receber_centavos, atendimentos: t.atendimentos, agendados: t.agendados };
    }),
  });
}));

// Horários livres para o admin (sem a antecedência mínima)
// Na remarcação (ignorar = código do horário), vale a duração do horário marcado, com os adicionais dele
const esquemaHorariosAdmin = z.object({ servico: campos.slug, adicionais: campos.adicionaisQuery, data: campos.dataISO, ignorar: campos.codigo.optional() });
rotasAdmin.get('/horarios', validar(esquemaHorariosAdmin, 'query'), rota(async (req, res) => {
  const atual = req.dados.ignorar ? await umaLinha('SELECT id, duracao_min FROM agendamentos WHERE codigo = ?', [req.dados.ignorar]) : null;
  const { horarios } = await horariosDoDia({
    slug: req.dados.servico, adicionais: req.dados.adicionais, dataISO: req.dados.data,
    ignorarId: atual?.id ?? null, duracaoFixa: atual?.duracao_min ?? null, semAntecedencia: true,
  });
  res.set('Cache-Control', 'no-store').json({ horarios });
}));

// ------------------------------------------------------------------ ações nos agendamentos
const esquemaNovo = z.object({
  servico: campos.slug,
  adicionais: campos.adicionais,
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
    adicionais: d.adicionais,
    inicio: d.inicio,
    origem: 'admin',
    observacao: d.observacao || null,
  });
  await anexarAdicionais([ag]);
  await registrar(req, 'admin_criou_agendamento', ag.codigo);
  res.status(201).json({ agendamento: paraAdmin(ag) });
}));

const porCodigo = validar(z.object({ codigo: campos.codigo }), 'params');

rotasAdmin.post('/agendamentos/:codigo/status', porCodigo, rota(async (req, res) => {
  const r = z.object({ status: z.enum(['concluido', 'faltou', 'confirmado']) }).safeParse(req.body);
  if (!r.success) throw erros.validacao({ status: 'Status inválido.' });
  const ag = await definirStatus({ codigo: req.dados.codigo, status: r.data.status });
  await anexarAdicionais([ag]);
  await registrar(req, 'admin_status', ag.codigo, { status: r.data.status });
  res.json({ agendamento: paraAdmin(ag) });
}));

rotasAdmin.post('/agendamentos/:codigo/cancelar', porCodigo, rota(async (req, res) => {
  const r = z.object({ motivo: z.string().trim().max(255).optional() }).safeParse(req.body ?? {});
  if (!r.success) throw erros.validacao({ motivo: 'Motivo muito longo.' });
  const ag = await cancelarAgendamento({ codigo: req.dados.codigo, porAdmin: true, motivo: r.data.motivo || null });
  await registrar(req, 'admin_cancelou', ag.codigo);
  res.json({ agendamento: paraAdmin((await anexarAdicionais([await buscarAgendamento('a.id = ?', [ag.id])]))[0]) });
}));

rotasAdmin.post('/agendamentos/:codigo/remarcar', porCodigo, rota(async (req, res) => {
  const r = z.object({ inicio: campos.instante }).safeParse(req.body);
  if (!r.success) throw erros.validacao({ inicio: 'Horário inválido.' });
  const ag = await remarcarAgendamento({ codigo: req.dados.codigo, inicio: r.data.inicio, porAdmin: true });
  await anexarAdicionais([ag]);
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
// tipo: "principal" é o corte que o cliente escolhe; "adicional" soma ao corte (luzes, boyzão, progressiva...)
const esquemaServico = z.object({
  nome: z.string().trim().min(2).max(80),
  descricao: z.string().trim().max(255).optional().default(''),
  tipo: z.enum(['principal', 'adicional']).optional().default('principal'),
  preco_centavos: z.number().int().min(0).max(1_000_000),
  duracao_min: z.number().int().min(5).max(480),
  ativo: z.boolean().optional().default(true),
  ordem: z.number().int().min(0).max(999).optional().default(0),
});

rotasAdmin.get('/servicos', rota(async (_req, res) => {
  res.json({ servicos: await consulta("SELECT id, slug, nome, descricao, tipo, preco_centavos, duracao_min, ativo, ordem FROM servicos ORDER BY tipo = 'adicional', ordem, id") });
}));

rotasAdmin.post('/servicos', validar(esquemaServico.extend({ slug: campos.slug })), rota(async (req, res) => {
  const d = req.dados;
  try {
    const r = await consulta('INSERT INTO servicos (slug, nome, descricao, tipo, preco_centavos, duracao_min, ativo, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      d.slug, d.nome, d.descricao, d.tipo, d.preco_centavos, d.duracao_min, d.ativo ? 1 : 0, d.ordem,
    ]);
    await registrar(req, 'admin_criou_servico', d.slug);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw erros.validacao({ nome: 'Já existe um serviço com esse nome.' });
    throw e;
  }
}));

rotasAdmin.put('/servicos/:id', validar(z.object({ id: z.coerce.number().int().positive() }), 'params'), rota(async (req, res) => {
  const r = esquemaServico.safeParse(req.body);
  if (!r.success) throw erros.validacao({ servico: 'Dados do serviço inválidos.' });
  const d = r.data;
  const out = await consulta('UPDATE servicos SET nome = ?, descricao = ?, tipo = ?, preco_centavos = ?, duracao_min = ?, ativo = ?, ordem = ? WHERE id = ?', [
    d.nome, d.descricao, d.tipo, d.preco_centavos, d.duracao_min, d.ativo ? 1 : 0, d.ordem, req.dados.id,
  ]);
  if (!out.affectedRows) throw erros.naoEncontrado('Serviço não encontrado.');
  await registrar(req, 'admin_editou_servico', String(req.dados.id), d);
  res.json({ ok: true });
}));

// Serviço que nunca foi marcado pode sumir de vez. Com histórico, ele só fica oculto: o rendimento antigo continua certo.
rotasAdmin.delete('/servicos/:id', validar(z.object({ id: z.coerce.number().int().positive() }), 'params'), rota(async (req, res) => {
  const usado = await umaLinha('SELECT 1 AS usado FROM agendamentos WHERE servico_id = ? LIMIT 1', [req.dados.id]);
  if (usado) {
    throw erros.conflito('Esse serviço já tem horários no histórico. Desmarque "Aparece para os clientes" para escondê-lo.', 'servico_com_historico');
  }
  if (!(await executar('DELETE FROM servicos WHERE id = ?', [req.dados.id]))) throw erros.naoEncontrado('Serviço não encontrado.');
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
