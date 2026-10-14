// Fila de e-mails (outbox). O e-mail é gravado junto com o evento e entregue em seguida, com novas tentativas.
// Entrega pela API do Brevo (BREVO_API_KEY) ou por SMTP. Sem nenhum dos dois, o "envio" salva o e-mail
// em var/emails/ para conferir no desenvolvimento.
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

const URL_BREVO = 'https://api.brevo.com/v3/smtp/email';

/** "Barbearia do Fortão <contato@dominio>" vira { name, email }, como o Brevo pede. */
export function remetenteBrevo(texto) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(texto));
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: String(texto).trim() };
}

// API HTTPS do Brevo (porta 443): funciona mesmo em hospedagem que bloqueia as portas de SMTP
function transporteBrevo() {
  return {
    async sendMail(msg) {
      const r = await fetch(URL_BREVO, {
        method: 'POST',
        headers: { 'api-key': config.email.brevoChave, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: remetenteBrevo(msg.from),
          to: [{ email: msg.to }],
          subject: msg.subject,
          htmlContent: msg.html,
          textContent: msg.text,
          attachment: msg.attachments?.length
            ? msg.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString('base64') }))
            : undefined,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const corpo = await r.json().catch(() => ({}));
      // A mensagem do Brevo vai para o log e para o aviso do painel ("Key not found", remetente não validado...)
      if (!r.ok) throw new Error(`Brevo ${r.status}: ${corpo.message || corpo.code || r.statusText}`);
      return { messageId: corpo.messageId };
    },
  };
}

function obterTransporte() {
  if (transporte) return transporte;
  if (config.email.brevoChave) {
    transporte = transporteBrevo();
    log.info('email_pelo_brevo');
  } else if (config.email.host) {
    transporte = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
    });
  } else {
    transporte = transporteArquivo();
    log.aviso('email_nao_configurado', { pasta: config.email.pastaLocal });
  }
  return transporte;
}

/** O painel avisa o Fortão quando os e-mails ainda não saem de verdade. */
export const emailConfigurado = () => Boolean(config.email.brevoChave || config.email.host);

/** Último erro de entrega ainda sem solução (últimas 48 h), para o painel mostrar. */
export async function ultimoErroEmail() {
  const linha = await umaLinha(
    `SELECT erro FROM emails_saida
      WHERE enviado_em IS NULL AND erro IS NOT NULL AND criado_em > UTC_TIMESTAMP() - INTERVAL 2 DAY
      ORDER BY id DESC LIMIT 1`,
  );
  return linha?.erro ?? null;
}

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
