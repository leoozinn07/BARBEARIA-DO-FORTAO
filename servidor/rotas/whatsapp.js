// Webhook do WhatsApp: a Meta avisa aqui quando um cliente manda mensagem para o número da barbearia.
// Fica fora da API comum (sem sessão e sem CSRF): quem chama é o servidor da Meta, e cada aviso vem assinado
// com o "App secret". Aviso sem assinatura válida é recusado, então ninguém cancela horário se passando pela Meta.
import { createHmac } from 'node:crypto';
import express, { Router } from 'express';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { iguais } from '../lib/seguranca.js';
import { tratarMensagem } from '../whatsapp/robo.js';

export const rotasWhatsapp = Router();

// Verificação do endereço, feita uma vez quando o webhook é cadastrado no painel da Meta
rotasWhatsapp.get('/', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const desafio = String(req.query['hub.challenge'] ?? '');
  if (modo === 'subscribe' && config.whatsapp.tokenVerificacao && iguais(token, config.whatsapp.tokenVerificacao) && /^\d{1,64}$/.test(desafio)) {
    return res.type('text/plain').send(desafio);
  }
  res.sendStatus(403);
});

function assinaturaValida(req) {
  const segredo = config.whatsapp.segredoApp;
  const recebida = req.get('x-hub-signature-256') || '';
  if (!segredo || !Buffer.isBuffer(req.body)) return false;
  const esperada = `sha256=${createHmac('sha256', segredo).update(req.body).digest('hex')}`;
  return iguais(recebida, esperada);
}

/** Texto de uma mensagem recebida: texto digitado ou botão tocado num modelo. */
function textoDa(m) {
  if (m.type === 'text') return m.text?.body;
  if (m.type === 'button') return m.button?.text || m.button?.payload;
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title;
  return '';
}

rotasWhatsapp.post('/', express.raw({ type: 'application/json', limit: '256kb' }), (req, res) => {
  if (!assinaturaValida(req)) return res.sendStatus(401);
  // Responde na hora: se demorar, a Meta reenvia o mesmo aviso
  res.sendStatus(200);
  let corpo;
  try {
    corpo = JSON.parse(req.body.toString('utf8'));
  } catch {
    return;
  }
  for (const entrada of corpo?.entry ?? []) {
    for (const mudanca of entrada?.changes ?? []) {
      for (const m of mudanca?.value?.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        tratarMensagem({ id: m.id, de: m.from, texto: textoDa(m) })
          .catch((e) => log.erro('whatsapp_robo', { erro: e.message }));
      }
    }
  }
});
