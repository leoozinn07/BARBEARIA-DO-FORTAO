// Notificações push (Web Push / VAPID). Funcionam no navegador e no app Android (TWA).
import webpush from 'web-push';
import { config } from '../config.js';
import { consulta } from '../db/index.js';
import { log } from '../lib/log.js';
import { hashToken } from '../lib/seguranca.js';

export const pushAtivo = Boolean(config.push.publica && config.push.privada);
if (pushAtivo) webpush.setVapidDetails(config.push.contato, config.push.publica, config.push.privada);

let enviarFn = (inscricao, corpo, opcoes) => webpush.sendNotification(inscricao, corpo, opcoes);
/** Testes trocam o envio real por uma função de captura. */
export function definirEnvioPush(fn) {
  enviarFn = fn;
}

export async function salvarInscricao(usuarioId, { endpoint, keys }) {
  await consulta(
    `INSERT INTO push_inscricoes (usuario_id, endpoint, endpoint_hash, p256dh, auth) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [usuarioId, endpoint, hashToken(endpoint), keys.p256dh, keys.auth],
  );
}

export async function removerInscricao(usuarioId, endpoint) {
  await consulta('DELETE FROM push_inscricoes WHERE usuario_id = ? AND endpoint_hash = ?', [usuarioId, hashToken(endpoint)]);
}

/** Envia para todos os aparelhos dos usuários. Inscrição vencida (404/410) é apagada. */
export async function enviarPush(usuarioIds, { titulo, corpo, link = '/conta', tag }) {
  if ((!pushAtivo && !config.testes) || !usuarioIds?.length) return 0;
  const inscricoes = await consulta('SELECT id, endpoint, p256dh, auth FROM push_inscricoes WHERE usuario_id IN (?)', [usuarioIds]);
  const carga = JSON.stringify({ titulo, corpo, link, tag });
  let enviados = 0;
  await Promise.all(inscricoes.map(async (i) => {
    try {
      await enviarFn({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carga, { TTL: 6 * 3600, urgency: 'high' });
      enviados++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await consulta('DELETE FROM push_inscricoes WHERE id = ?', [i.id]);
      else log.aviso('push_falhou', { status: e.statusCode, erro: e.message });
    }
  }));
  return enviados;
}
