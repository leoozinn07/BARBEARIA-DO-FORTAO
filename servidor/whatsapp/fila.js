// Fila do WhatsApp (outbox), igual à de e-mails: a mensagem é gravada junto com o evento e entregue em seguida,
// com novas tentativas. Envio pela WhatsApp Cloud API (Meta). Sem token configurado, cada mensagem vira um arquivo
// em var/whatsapp/ para conferir no desenvolvimento.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { consulta, umaLinha } from '../db/index.js';
import { log } from '../lib/log.js';

const MAX_TENTATIVAS = 6;
let agendado = null;
let avisou = false;

/** Número no formato do WhatsApp: só dígitos, com o 55 do Brasil na frente. */
export function numeroWhatsapp(telefone) {
  const d = String(telefone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

/** DDD + 8 últimos dígitos: o mesmo celular com ou sem o 9 da frente (o WhatsApp às vezes manda sem). */
export function chaveTelefone(telefone) {
  const n = numeroWhatsapp(telefone);
  return n ? n.slice(2, 4) + n.slice(-8) : null;
}

export const whatsappConfigurado = () => Boolean(config.whatsapp.token && config.whatsapp.numeroId);

/**
 * Grava a mensagem na fila. Use o `conn` da transação do evento.
 * modelo + parametros: mensagem iniciada pela barbearia (precisa de modelo aprovado na Meta).
 * Só texto: resposta do robô a quem acabou de escrever (vale dentro de 24 h da última mensagem do cliente).
 */
export async function enfileirarWhatsapp(conn, { para, modelo = null, parametros = null, texto, agendamentoId = null }) {
  const numero = numeroWhatsapp(para);
  if (!numero) return;
  await consulta(
    'INSERT INTO whatsapp_saida (para, modelo, parametros, texto, agendamento_id) VALUES (?, ?, ?, ?, ?)',
    [numero, modelo, parametros ? JSON.stringify(parametros) : null, texto, agendamentoId],
    conn,
  );
}

async function salvarLocal(msg) {
  if (!avisou) {
    log.aviso('whatsapp_nao_configurado', { pasta: config.whatsapp.pastaLocal });
    avisou = true;
  }
  await mkdir(config.whatsapp.pastaLocal, { recursive: true });
  const cabecalho = `Para: +${msg.para}\n${msg.modelo ? `Modelo: ${msg.modelo} ${JSON.stringify(msg.parametros)}\n` : ''}\n`;
  await writeFile(path.join(config.whatsapp.pastaLocal, `${Date.now()}-${msg.id}-${msg.para}.txt`), cabecalho + msg.texto);
}

async function enviarPelaMeta(msg) {
  const { token, numeroId, versaoApi, idioma } = config.whatsapp;
  const corpo = msg.modelo
    ? {
        messaging_product: 'whatsapp',
        to: msg.para,
        type: 'template',
        template: {
          name: msg.modelo,
          language: { code: idioma },
          components: [{ type: 'body', parameters: (msg.parametros || []).map((p) => ({ type: 'text', text: String(p) })) }],
        },
      }
    : { messaging_product: 'whatsapp', to: msg.para, type: 'text', text: { body: msg.texto, preview_url: false } };
  const r = await fetch(`https://graph.facebook.com/${versaoApi}/${encodeURIComponent(numeroId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const dados = await r.json().catch(() => ({}));
    throw new Error(dados?.error?.message || `WhatsApp respondeu ${r.status}`);
  }
}

/** Entrega o que estiver pendente. Cada mensagem é "reservada" antes do envio, então duas instâncias não duplicam. */
export async function processarFilaWhatsapp({ limite = 20 } = {}) {
  const pendentes = await consulta(
    `SELECT id FROM whatsapp_saida
      WHERE enviado_em IS NULL AND tentativas < ? AND proxima_tentativa_em <= UTC_TIMESTAMP()
      ORDER BY id LIMIT ?`,
    [MAX_TENTATIVAS, limite],
  );
  let enviadas = 0;
  for (const { id } of pendentes) {
    const reserva = await consulta(
      `UPDATE whatsapp_saida SET tentativas = tentativas + 1, proxima_tentativa_em = UTC_TIMESTAMP() + INTERVAL 5 MINUTE
        WHERE id = ? AND enviado_em IS NULL AND proxima_tentativa_em <= UTC_TIMESTAMP()`,
      [id],
    );
    if (reserva.affectedRows !== 1) continue;
    const msg = await umaLinha('SELECT * FROM whatsapp_saida WHERE id = ?', [id]);
    msg.parametros = typeof msg.parametros === 'string' ? JSON.parse(msg.parametros) : msg.parametros;
    try {
      if (whatsappConfigurado()) await enviarPelaMeta(msg); else await salvarLocal(msg);
      await consulta('UPDATE whatsapp_saida SET enviado_em = UTC_TIMESTAMP(), erro = NULL WHERE id = ?', [id]);
      enviadas++;
    } catch (e) {
      const espera = 2 ** msg.tentativas;
      await consulta('UPDATE whatsapp_saida SET erro = ?, proxima_tentativa_em = UTC_TIMESTAMP() + INTERVAL ? MINUTE WHERE id = ?', [
        String(e.message).slice(0, 500), espera, id,
      ]);
      log.erro('whatsapp_falhou', { id, tentativa: msg.tentativas, erro: e.message });
    }
  }
  return enviadas;
}

/** Pede uma entrega logo (depois de um commit), sem esperar o próximo ciclo. */
export function acordarWhatsapp() {
  if (agendado) return;
  agendado = setTimeout(() => {
    agendado = null;
    processarFilaWhatsapp().catch((e) => log.erro('fila_whatsapp', { erro: e.message }));
  }, 200);
}
