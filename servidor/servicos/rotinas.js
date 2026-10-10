// Rotinas em segundo plano: lembretes, entrega de e-mails e limpeza de dados vencidos.
// Cada lembrete é "reservado" com um UPDATE condicional: mesmo com duas instâncias, ninguém recebe lembrete duplicado.
import { config } from '../config.js';
import { consulta, transacao } from '../db/index.js';
import { processarFila } from '../emails/fila.js';
import { log } from '../lib/log.js';
import { buscarAgendamento } from './agenda.js';
import * as eventos from './eventos.js';

const HORA = 3600000;

async function lembrarUm(id, coluna, tipo) {
  const efeitos = await transacao(async (conn) => {
    const r = await consulta(`UPDATE agendamentos SET ${coluna} = UTC_TIMESTAMP() WHERE id = ? AND ${coluna} IS NULL AND status = 'confirmado'`, [id], conn);
    if (r.affectedRows !== 1) return null;
    // Quem recebe o de 2 h não precisa mais do de 24 h
    if (tipo === '2h') await consulta('UPDATE agendamentos SET lembrete_24h_em = COALESCE(lembrete_24h_em, UTC_TIMESTAMP()) WHERE id = ?', [id], conn);
    const ag = await buscarAgendamento('a.id = ?', [id], conn);
    return eventos.aoLembrar(conn, ag, tipo);
  });
  if (efeitos) eventos.executarEfeitos(efeitos);
  return Boolean(efeitos);
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

/** Apaga o que não precisa mais existir (minimização de dados, LGPD). */
export async function limpar() {
  await consulta('DELETE FROM sessoes WHERE expira_em < UTC_TIMESTAMP()');
  await consulta('DELETE FROM tokens_uso_unico WHERE expira_em < UTC_TIMESTAMP() - INTERVAL 1 DAY');
  await consulta('DELETE FROM notificacoes WHERE criado_em < UTC_TIMESTAMP() - INTERVAL 180 DAY');
  await consulta('DELETE FROM emails_saida WHERE (enviado_em IS NOT NULL OR tentativas >= 6) AND criado_em < UTC_TIMESTAMP() - INTERVAL 30 DAY');
  await consulta('DELETE FROM agenda_travas WHERE dia < UTC_DATE() - INTERVAL 2 DAY');
}

const timers = [];
export function iniciarRotinas() {
  if (!config.agendadorAtivo) return;
  const seguro = (nome, fn) => () => fn().catch((e) => log.erro(`rotina_${nome}`, { erro: e.message }));
  timers.push(setInterval(seguro('lembretes', processarLembretes), 60000));
  timers.push(setInterval(seguro('emails', processarFila), 15000));
  timers.push(setInterval(seguro('limpeza', limpar), 6 * HORA));
  timers.forEach((t) => t.unref());
  seguro('emails', processarFila)();
  seguro('lembretes', processarLembretes)();
  log.info('rotinas_iniciadas');
}

export function pararRotinas() {
  while (timers.length) clearInterval(timers.pop());
}
