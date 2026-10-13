// Rotinas em segundo plano: lembretes, entrega de e-mails, conclusão automática e limpeza de dados vencidos.
// Cada lembrete é "reservado" com um UPDATE condicional: mesmo com duas instâncias, ninguém recebe lembrete duplicado.
import { config } from '../config.js';
import { consulta, executar, transacao } from '../db/index.js';
import { processarFila } from '../emails/fila.js';
import { log } from '../lib/log.js';
import { buscarAgendamento } from './agenda.js';
import { limparDesafios } from './biometria.js';
import * as eventos from './eventos.js';

const HORA = 3600000;

async function lembrarUm(id, coluna, tipo) {
  const lembrou = await transacao(async (conn) => {
    const reservado = await executar(`UPDATE agendamentos SET ${coluna} = UTC_TIMESTAMP() WHERE id = ? AND ${coluna} IS NULL AND status = 'confirmado'`, [id], conn);
    if (reservado !== 1) return false;
    // Quem recebe o de 2 h não precisa mais do de 24 h
    if (tipo === '2h') await executar('UPDATE agendamentos SET lembrete_24h_em = COALESCE(lembrete_24h_em, UTC_TIMESTAMP()) WHERE id = ?', [id], conn);
    const ag = await buscarAgendamento('a.id = ?', [id], conn);
    await eventos.aoLembrar(conn, ag, tipo);
    return true;
  });
  if (lembrou) eventos.entregarAgora();
  return lembrou;
}

export async function processarLembretes(agora = new Date()) {
  const t = agora.getTime();
  let enviados = 0;
  const de2h = await consulta(
    "SELECT id FROM agendamentos WHERE status = 'confirmado' AND lembrete_2h_em IS NULL AND inicio > ? AND inicio <= ?",
    [new Date(t), new Date(t + 2 * HORA)],
  );
  for (const { id } of de2h) if (await lembrarUm(id, 'lembrete_2h_em', '2h')) enviados++;
  const de24h = await consulta(
    "SELECT id FROM agendamentos WHERE status = 'confirmado' AND lembrete_24h_em IS NULL AND inicio > ? AND inicio <= ?",
    [new Date(t + 2 * HORA), new Date(t + 24 * HORA)],
  );
  for (const { id } of de24h) if (await lembrarUm(id, 'lembrete_24h_em', '24h')) enviados++;
  return enviados;
}

/**
 * Horário confirmado que terminou há mais de 3 h vira "concluído" e entra no rendimento.
 * Se o cliente não apareceu, o Fortão marca "faltou" no painel e o valor sai da conta.
 */
export async function concluirPassados() {
  return executar("UPDATE agendamentos SET status = 'concluido' WHERE status = 'confirmado' AND fim < UTC_TIMESTAMP() - INTERVAL 3 HOUR");
}

/** Apaga o que não precisa mais existir (minimização de dados, LGPD). */
export async function limpar() {
  await executar('DELETE FROM sessoes WHERE expira_em < UTC_TIMESTAMP()');
  await executar('DELETE FROM tokens_uso_unico WHERE expira_em < UTC_TIMESTAMP() - INTERVAL 1 DAY');
  await executar('DELETE FROM notificacoes WHERE criado_em < UTC_TIMESTAMP() - INTERVAL 180 DAY');
  await executar('DELETE FROM emails_saida WHERE (enviado_em IS NOT NULL OR tentativas >= 6) AND criado_em < UTC_TIMESTAMP() - INTERVAL 30 DAY');
  await executar('DELETE FROM agenda_travas WHERE dia < UTC_DATE() - INTERVAL 2 DAY');
  await limparDesafios();
}

const timers = [];
export function iniciarRotinas() {
  if (!config.agendadorAtivo) return;
  const seguro = (nome, fn) => () => fn().catch((e) => log.erro(`rotina_${nome}`, { erro: e.message }));
  timers.push(setInterval(seguro('lembretes', processarLembretes), 60000));
  timers.push(setInterval(seguro('emails', processarFila), 15000));
  timers.push(setInterval(seguro('concluir', concluirPassados), 10 * 60000));
  timers.push(setInterval(seguro('limpeza', limpar), 6 * HORA));
  timers.forEach((t) => t.unref());
  seguro('emails', processarFila)();
  seguro('lembretes', processarLembretes)();
  seguro('concluir', concluirPassados)();
  log.info('rotinas_iniciadas');
}

export function pararRotinas() {
  while (timers.length) clearInterval(timers.pop());
}
