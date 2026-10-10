// Agenda: horários livres, marcar, remarcar, cancelar e mudar status.
// Regra de ouro: marcar e remarcar travam o dia (agenda_travas) e conferem conflito dentro da mesma transação.
import { consulta, umaLinha, transacao } from '../db/index.js';
import { erros } from '../lib/erros.js';
import { gerarCodigo } from '../lib/seguranca.js';
import * as tempo from '../lib/tempo.js';
import { lerConfiguracoes } from './configuracoes.js';
import * as eventos from './eventos.js';

const MIN = 60000;
const HORA = 3600000;
/** Status que ocupam a cadeira. Cancelado libera o horário. */
export const STATUS_OCUPA = ['confirmado', 'concluido', 'faltou'];

// ----------------------------------------------------------------- leitura

export async function listarServicos({ incluirInativos = false } = {}) {
  return consulta(
    `SELECT id, slug, nome, descricao, preco_centavos, duracao_min, ativo, ordem FROM servicos
      ${incluirInativos ? '' : 'WHERE ativo = 1'} ORDER BY ordem, id`,
  );
}

async function servicoAtivo(slug, conn) {
  const s = await umaLinha('SELECT id, slug, nome, preco_centavos, duracao_min FROM servicos WHERE slug = ? AND ativo = 1', [slug], conn);
  if (!s) throw erros.requisicao('Esse serviço não está disponível.', { codigo: 'servico_invalido' });
  return s;
}

export async function barbeiroPadrao(conn) {
  const b = await umaLinha('SELECT id FROM barbeiros WHERE ativo = 1 ORDER BY id LIMIT 1', [], conn);
  if (!b) throw new Error('Nenhum barbeiro ativo cadastrado. Rode npm run semear.');
  return b.id;
}

/** Map dia_semana => [{abre, fecha}] em minutos do dia */
export async function faixasDoBarbeiro(barbeiroId, conn) {
  const linhas = await consulta('SELECT dia_semana, abre, fecha FROM horarios_funcionamento WHERE barbeiro_id = ? ORDER BY dia_semana, abre', [barbeiroId], conn);
  const mapa = new Map();
  for (const l of linhas) {
    if (!mapa.has(l.dia_semana)) mapa.set(l.dia_semana, []);
    mapa.get(l.dia_semana).push({ abre: tempo.horaParaMinutos(l.abre), fecha: tempo.horaParaMinutos(l.fecha) });
  }
  return mapa;
}

/** Intervalos ocupados (agendamentos que ocupam a cadeira + bloqueios) entre `de` e `ate`. */
async function ocupacoes(barbeiroId, de, ate, conn, ignorarId = null) {
  const ags = await consulta(
    `SELECT inicio, fim FROM agendamentos
      WHERE barbeiro_id = ? AND status IN (?) AND inicio < ? AND fim > ? ${ignorarId ? 'AND id <> ?' : ''}`,
    [barbeiroId, STATUS_OCUPA, ate, de, ...(ignorarId ? [ignorarId] : [])],
    conn,
  );
  const bloqs = await consulta('SELECT inicio, fim FROM bloqueios WHERE barbeiro_id = ? AND inicio < ? AND fim > ?', [barbeiroId, ate, de], conn);
  return [...ags, ...bloqs].map((o) => ({ ini: new Date(o.inicio).getTime(), fim: new Date(o.fim).getTime() }));
}

/**
 * Cálculo puro dos horários livres de um dia (fácil de testar).
 * Um horário vale se cabe inteiro numa faixa, respeita a antecedência e não encosta em nada ocupado.
 */
export function calcularLivres({ dataISO, duracaoMin, faixas, ocupados, regras, agora = new Date(), semAntecedencia = false }) {
  const doDia = faixas.get(tempo.diaSemana(dataISO)) || [];
  const minimo = agora.getTime() + (semAntecedencia ? 0 : regras.antecedencia_min * MIN);
  const livres = [];
  for (const faixa of doDia) {
    for (let m = faixa.abre; m + duracaoMin <= faixa.fecha; m += regras.passo_min) {
      const ini = tempo.localParaUtc(dataISO, m).getTime();
      const fim = ini + duracaoMin * MIN;
      if (ini < minimo) continue;
      if (ocupados.some((o) => ini < o.fim && fim > o.ini)) continue;
      livres.push({ inicio: new Date(ini).toISOString(), hora: tempo.minutosParaHora(m) });
    }
  }
  return livres;
}

function conferirJanela(dataISO, regras, agora = new Date()) {
  if (!tempo.dataISOValida(dataISO)) throw erros.validacao({ data: 'Data inválida.' });
  const hoje = tempo.dataLocalISO(agora);
  const ultimo = tempo.somarDias(hoje, regras.janela_dias);
  if (dataISO < hoje) throw erros.requisicao('Essa data já passou.', { codigo: 'data_passada' });
  if (dataISO > ultimo) throw erros.requisicao(`A agenda abre só para os próximos ${regras.janela_dias} dias.`, { codigo: 'fora_da_janela' });
}

export async function horariosDoDia({ slug, dataISO, ignorarId = null, semAntecedencia = false }, conn) {
  const { agenda: regras } = await lerConfiguracoes();
  conferirJanela(dataISO, regras);
  const servico = await servicoAtivo(slug, conn);
  const barbeiroId = await barbeiroPadrao(conn);
  const faixas = await faixasDoBarbeiro(barbeiroId, conn);
  const { de, ate } = tempo.limitesDoDia(dataISO);
  const ocupados = await ocupacoes(barbeiroId, de, ate, conn, ignorarId);
  return { servico, horarios: calcularLivres({ dataISO, duracaoMin: servico.duracao_min, faixas, ocupados, regras, semAntecedencia }) };
}

/** Próximos dias com a contagem de horários livres (para o seletor de dias). Duas consultas para a janela toda. */
export async function diasDisponiveis({ slug }) {
  const { agenda: regras } = await lerConfiguracoes();
  const servico = await servicoAtivo(slug);
  const barbeiroId = await barbeiroPadrao();
  const faixas = await faixasDoBarbeiro(barbeiroId);
  const hoje = tempo.dataLocalISO(new Date());
  const fimJanela = tempo.somarDias(hoje, regras.janela_dias);
  const ocupados = await ocupacoes(barbeiroId, tempo.limitesDoDia(hoje).de, tempo.limitesDoDia(fimJanela).ate);
  const dias = [];
  for (let i = 0; i <= regras.janela_dias; i++) {
    const data = tempo.somarDias(hoje, i);
    const aberto = (faixas.get(tempo.diaSemana(data)) || []).length > 0;
    const livres = aberto ? calcularLivres({ dataISO: data, duracaoMin: servico.duracao_min, faixas, ocupados, regras }) : [];
    dias.push({ data, dia_semana: tempo.diaSemana(data), aberto, livres: livres.length, primeiro: livres[0]?.hora ?? null });
  }
  return { servico, dias };
}

// ----------------------------------------------------------------- escrita

/** Garante a linha do dia fora de qualquer transação (INSERT IGNORE concorrente dentro de transação gera impasse). */
async function prepararTrava(barbeiroId, dataISO) {
  await consulta('INSERT IGNORE INTO agenda_travas (barbeiro_id, dia) VALUES (?, ?)', [barbeiroId, dataISO]);
}

/** Dentro da transação: trava o dia. Quem chegar depois espera aqui até o primeiro terminar. */
async function travarDia(conn, barbeiroId, dataISO) {
  await consulta('SELECT barbeiro_id FROM agenda_travas WHERE barbeiro_id = ? AND dia = ? FOR UPDATE', [barbeiroId, dataISO], conn);
}

export async function buscarAgendamento(where, params, conn) {
  return umaLinha(
    `SELECT a.*, u.email AS cliente_email FROM agendamentos a LEFT JOIN usuarios u ON u.id = a.cliente_id WHERE ${where}`,
    params,
    conn,
  );
}

/** Confere se `inicio` é um horário válido e livre agora, já com o dia travado. */
async function garantirHorarioLivre(conn, { barbeiroId, servico, inicio, ignorarId, semAntecedencia }) {
  const dataISO = tempo.dataLocalISO(inicio);
  const { agenda: regras } = await lerConfiguracoes();
  const faixas = await faixasDoBarbeiro(barbeiroId, conn);
  const { de, ate } = tempo.limitesDoDia(dataISO);
  const ocupados = await ocupacoes(barbeiroId, de, ate, conn, ignorarId);
  const livres = calcularLivres({ dataISO, duracaoMin: servico.duracao_min, faixas, ocupados, regras, semAntecedencia });
  if (!livres.some((h) => h.inicio === inicio.toISOString())) {
    throw erros.conflito('Esse horário acabou de ser ocupado ou não está disponível. Escolha outro.', 'horario_ocupado');
  }
}

/** Marcações de lembrete já "vencidas" no momento da criação (não lembrar 24 h antes de algo marcado para daqui a 3 h). */
function lembretesIniciais(inicio, agora = Date.now()) {
  const falta = inicio.getTime() - agora;
  return { l24: falta <= 24 * HORA ? new Date(agora) : null, l2: falta <= 2 * HORA ? new Date(agora) : null };
}

/**
 * Marca um horário.
 * cliente: { id, nome, telefone } de um usuário logado, ou avulso: { nome, telefone } (só o admin).
 */
export async function criarAgendamento({ cliente = null, avulso = null, slug, inicio: inicioISO, origem = 'app', observacao = null }) {
  const { agenda: regras } = await lerConfiguracoes();
  const inicio = new Date(inicioISO);
  if (Number.isNaN(inicio.getTime())) throw erros.validacao({ inicio: 'Horário inválido.' });
  const porAdmin = origem === 'admin';
  conferirJanela(tempo.dataLocalISO(inicio), regras);

  if (cliente && !porAdmin) {
    const { total } = await umaLinha(
      "SELECT COUNT(*) AS total FROM agendamentos WHERE cliente_id = ? AND status = 'confirmado' AND inicio > UTC_TIMESTAMP()",
      [cliente.id],
    );
    if (total >= regras.max_futuros_por_cliente) {
      throw erros.conflito(`Você já tem ${total} horários marcados. Para marcar mais, fale com a barbearia.`, 'limite_horarios');
    }
  }

  const servico = await servicoAtivo(slug);
  const barbeiroId = await barbeiroPadrao();
  await prepararTrava(barbeiroId, tempo.dataLocalISO(inicio));
  const { agendamento, efeitos } = await transacao(async (conn) => {
    await travarDia(conn, barbeiroId, tempo.dataLocalISO(inicio));
    await garantirHorarioLivre(conn, { barbeiroId, servico, inicio, semAntecedencia: porAdmin });
    const fim = new Date(inicio.getTime() + servico.duracao_min * MIN);
    const { l24, l2 } = lembretesIniciais(inicio);
    const nome = cliente?.nome ?? avulso?.nome;
    const telefone = cliente?.telefone ?? avulso?.telefone ?? null;
    let id;
    for (let tentativa = 0; !id; tentativa++) {
      try {
        const r = await consulta(
          `INSERT INTO agendamentos (codigo, cliente_id, cliente_nome, cliente_telefone, barbeiro_id, servico_id, servico_nome,
             preco_centavos, duracao_min, inicio, fim, origem, observacao, lembrete_24h_em, lembrete_2h_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [gerarCodigo(), cliente?.id ?? null, nome, telefone, barbeiroId, servico.id, servico.nome, servico.preco_centavos,
            servico.duracao_min, inicio, fim, origem, observacao, l24, l2],
          conn,
        );
        id = r.insertId;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY' || tentativa >= 4) throw e; // código repetido: sorteia outro
      }
    }
    const ag = await buscarAgendamento('a.id = ?', [id], conn);
    return { agendamento: ag, efeitos: await eventos.aoAgendar(conn, ag) };
  });
  eventos.executarEfeitos(efeitos);
  return agendamento;
}

function conferirPrazoCliente(ag, regras) {
  if (ag.status !== 'confirmado') throw erros.conflito('Esse horário não pode mais ser alterado.', 'status_invalido');
  const limite = new Date(ag.inicio).getTime() - regras.cancelar_ate_horas * HORA;
  if (Date.now() > limite) {
    throw erros.conflito(`Pelo app dá para alterar até ${regras.cancelar_ate_horas} h antes. Agora, fale com a barbearia pelo WhatsApp.`, 'fora_do_prazo');
  }
}

export async function cancelarAgendamento({ codigo, usuario, porAdmin = false, motivo = null }) {
  const { agenda: regras } = await lerConfiguracoes();
  const { ag, efeitos } = await transacao(async (conn) => {
    const ag = await buscarAgendamento('a.codigo = ? FOR UPDATE', [codigo], conn);
    if (!ag || (!porAdmin && ag.cliente_id !== usuario.id)) throw erros.naoEncontrado('Horário não encontrado.');
    if (porAdmin) {
      if (ag.status !== 'confirmado') throw erros.conflito('Só dá para cancelar horários confirmados.', 'status_invalido');
    } else {
      conferirPrazoCliente(ag, regras);
    }
    await consulta(
      "UPDATE agendamentos SET status = 'cancelado', cancelado_por = ?, motivo_cancelamento = ? WHERE id = ?",
      [porAdmin ? 'admin' : 'cliente', motivo, ag.id],
      conn,
    );
    const atualizado = await buscarAgendamento('a.id = ?', [ag.id], conn);
    return { ag: atualizado, efeitos: await eventos.aoCancelar(conn, atualizado, { porAdmin, motivo }) };
  });
  eventos.executarEfeitos(efeitos);
  return ag;
}

export async function remarcarAgendamento({ codigo, usuario, inicio: inicioISO, porAdmin = false }) {
  const { agenda: regras } = await lerConfiguracoes();
  const novoInicio = new Date(inicioISO);
  if (Number.isNaN(novoInicio.getTime())) throw erros.validacao({ inicio: 'Horário inválido.' });
  conferirJanela(tempo.dataLocalISO(novoInicio), regras);
  const barbeiroId = await barbeiroPadrao();
  const anterior = await umaLinha('SELECT inicio FROM agendamentos WHERE codigo = ?', [codigo]);
  if (anterior) await prepararTrava(barbeiroId, tempo.dataLocalISO(new Date(anterior.inicio)));
  await prepararTrava(barbeiroId, tempo.dataLocalISO(novoInicio));

  const { ag, efeitos } = await transacao(async (conn) => {
    const atual = await buscarAgendamento('a.codigo = ?', [codigo], conn);
    if (!atual || (!porAdmin && atual.cliente_id !== usuario.id)) throw erros.naoEncontrado('Horário não encontrado.');
    // Trava os dois dias (antigo e novo) sempre na mesma ordem, para não haver impasse entre transações
    const dias = [...new Set([tempo.dataLocalISO(new Date(atual.inicio)), tempo.dataLocalISO(novoInicio)])].sort();
    for (const d of dias) await travarDia(conn, barbeiroId, d);
    const ag = await buscarAgendamento('a.id = ? FOR UPDATE', [atual.id], conn);
    if (porAdmin) {
      if (ag.status !== 'confirmado') throw erros.conflito('Só dá para remarcar horários confirmados.', 'status_invalido');
    } else {
      conferirPrazoCliente(ag, regras);
    }
    const servico = { duracao_min: ag.duracao_min };
    await garantirHorarioLivre(conn, { barbeiroId, servico, inicio: novoInicio, ignorarId: ag.id, semAntecedencia: porAdmin });
    const fim = new Date(novoInicio.getTime() + ag.duracao_min * MIN);
    const { l24, l2 } = lembretesIniciais(novoInicio);
    await consulta('UPDATE agendamentos SET inicio = ?, fim = ?, lembrete_24h_em = ?, lembrete_2h_em = ? WHERE id = ?', [novoInicio, fim, l24, l2, ag.id], conn);
    const atualizado = await buscarAgendamento('a.id = ?', [ag.id], conn);
    return { ag: atualizado, efeitos: await eventos.aoRemarcar(conn, atualizado, new Date(ag.inicio)) };
  });
  eventos.executarEfeitos(efeitos);
  return ag;
}

/** Admin: concluído ou faltou. */
export async function definirStatus({ codigo, status }) {
  const ag = await buscarAgendamento('a.codigo = ?', [codigo]);
  if (!ag) throw erros.naoEncontrado('Horário não encontrado.');
  if (ag.status === 'cancelado') throw erros.conflito('Esse horário foi cancelado.', 'status_invalido');
  if (new Date(ag.inicio).getTime() > Date.now() + 30 * MIN) {
    throw erros.conflito('Só dá para marcar como concluído ou falta depois que o horário começar.', 'cedo_demais');
  }
  await consulta('UPDATE agendamentos SET status = ? WHERE id = ?', [status, ag.id]);
  return buscarAgendamento('a.id = ?', [ag.id]);
}

// ----------------------------------------------------------------- saída

/** Formato público de um agendamento (sem IDs internos). */
export function paraCliente(ag, regras) {
  const inicio = new Date(ag.inicio);
  const podeAlterar = ag.status === 'confirmado' && Date.now() <= inicio.getTime() - regras.cancelar_ate_horas * HORA;
  return {
    codigo: ag.codigo,
    servico: ag.servico_nome,
    preco_centavos: ag.preco_centavos,
    duracao_min: ag.duracao_min,
    inicio: inicio.toISOString(),
    fim: new Date(ag.fim).toISOString(),
    status: ag.status,
    cancelado_por: ag.cancelado_por,
    motivo_cancelamento: ag.motivo_cancelamento,
    pode_alterar: podeAlterar,
  };
}

export function paraAdmin(ag) {
  return {
    ...paraCliente(ag, { cancelar_ate_horas: 0 }),
    cliente_nome: ag.cliente_nome,
    cliente_telefone: ag.cliente_telefone,
    cliente_email: ag.cliente_email ?? null,
    cliente_id: ag.cliente_id,
    origem: ag.origem,
    observacao: ag.observacao,
  };
}
