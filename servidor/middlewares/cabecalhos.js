// Cabeçalhos de segurança. CSP sem script inline: todo JS vem de arquivos do próprio site.
import helmet from 'helmet';
import { config } from '../config.js';

export const cabecalhos = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      // Só o mapa do Google, e só depois que o cliente toca em "Carregar mapa"
      frameSrc: ['https://www.google.com'],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(config.producao ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  strictTransportSecurity: config.producao ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
});

export function politicaPermissoes(_req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
}
