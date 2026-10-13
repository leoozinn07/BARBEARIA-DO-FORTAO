// Fila de e-mails (outbox). O e-mail é gravado junto com o evento e entregue em seguida, com novas tentativas.
// Sem SMTP configurado, o "envio" salva o e-mail em var/emails/ para conferir no desenvolvimento.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { consulta, umaLinha } from '../db/index.js';
import { log } from '../lib/log.js';

const MAX_TENTATIVAS = 6;
let transporte = null;
let agendado = null;

function transporteArquivo() {
  return {
    async sendMail(msg) {
      await mkdir(config.email.pastaLocal, { recursive: true });
      const base = `${Date.now()}-${String(msg.to).replace(/[^a-z0-9]+/gi, '_')}`;
      await writeFile(path.join(config.email.pastaLocal, `${base}.html`), msg.html);
      await writeFile(path.join(config.email.pastaLocal, `${base}.txt`), `Para: ${msg.to}\nAssunto: ${msg.subject}\n\n${msg.text}`);
      for (const a of msg.attachments || []) await writeFile(path.join(config.email.pastaLocal, `${base}-${a.filename}`), a.content);
      return { messageId: base };
    },
  };
}

function obterTransporte() {
  if (transporte) return transporte;
  transporte = config.email.host
    ? nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
      })
    : transporteArquivo();
  if (!config.email.host) log.aviso('smtp_nao_configurado', { pasta: config.email.pastaLocal });
  return transporte;
}

/** O painel avisa o Fortão quando os e-mails ainda não saem de verdade. */
export const smtpConfigurado = () => Boolean(config.email.host);

/** Grava o e-mail na fila. Use o `conn` da transação do evento. */
export async function enfileirarEmail(conn, { para, assunto, html, texto, anexos = null }) {
  if (!para) return;
  await consulta(
    'INSERT INTO emails_saida (para, assunto, html, texto, anexos) VALUES (?, ?, ?, ?, ?)',
    [para, assunto, html, texto, anexos ? JSON.stringify(anexos) : null],
    conn,
  );
}

/** Entrega o que estiver pendente. Cada e-mail é "reservado" antes do envio, então duas instâncias não duplicam. */
export async function processarFila({ limite = 20 } = {}) {
  const pendentes = await consulta(
    `SELECT id FROM emails_saida
      WHERE enviado_em IS NULL AND tentativas < ? AND proxima_tentativa_em <= UTC_TIMESTAMP()
      ORDER BY id LIMIT ?`,
    [MAX_TENTATIVAS, limite],
  );
  let enviados = 0;
  for (const { id } of pendentes) {
    const reserva = await consulta(
      `UPDATE emails_saida SET tentativas = tentativas + 1, proxima_tentativa_em = UTC_TIMESTAMP() + INTERVAL 5 MINUTE
        WHERE id = ? AND enviado_em IS NULL AND proxima_tentativa_em <= UTC_TIMESTAMP()`,
      [id],
    );
    if (reserva.affectedRows !== 1) continue;
    const email = await umaLinha('SELECT * FROM emails_saida WHERE id = ?', [id]);
    try {
      const anexos = typeof email.anexos === 'string' ? JSON.parse(email.anexos) : email.anexos;
      await obterTransporte().sendMail({
        from: config.email.remetente,
        to: email.para,
        subject: email.assunto,
        html: email.html,
        text: email.texto,
        attachments: anexos || undefined,
      });
      await consulta('UPDATE emails_saida SET enviado_em = UTC_TIMESTAMP(), erro = NULL WHERE id = ?', [id]);
      enviados++;
    } catch (e) {
      // Espera cresce a cada falha: 2, 4, 8, 16... minutos
      const espera = 2 ** email.tentativas;
      await consulta('UPDATE emails_saida SET erro = ?, proxima_tentativa_em = UTC_TIMESTAMP() + INTERVAL ? MINUTE WHERE id = ?', [
        String(e.message).slice(0, 500), espera, id,
      ]);
      log.erro('email_falhou', { id, tentativa: email.tentativas, erro: e.message });
    }
  }
  return enviados;
}

/** Pede uma entrega logo (depois de um commit), sem esperar o próximo ciclo. */
export function acordarEntregador() {
  if (agendado) return;
  agendado = setTimeout(() => {
    agendado = null;
    processarFila().catch((e) => log.erro('fila_email', { erro: e.message }));
  }, 200);
}
