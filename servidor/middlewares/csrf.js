// Proteção CSRF: cookie + cabeçalho iguais (double submit) e origem conferida em todo pedido que altera dados.
import { config } from '../config.js';
import { erros } from '../lib/erros.js';
import { gerarToken, iguais } from '../lib/seguranca.js';

const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Garante que existe um token CSRF no cookie e devolve o valor. */
export function garantirTokenCsrf(req, res) {
  let token = req.cookies?.[config.sessao.cookieCsrf];
  if (!token || token.length > 100) {
    token = gerarToken();
    req.cookies[config.sessao.cookieCsrf] = token;
    res.cookie(config.sessao.cookieCsrf, token, { httpOnly: false, secure: config.producao, sameSite: 'strict', path: '/' });
  }
  return token;
}

function origemPermitida(req) {
  const origem = req.get('origin');
  if (origem) return origem === config.origem;
  const referer = req.get('referer');
  if (referer) {
    try { return new URL(referer).origin === config.origem; } catch { return false; }
  }
  // Sem Origin nem Referer: o cabeçalho X-CSRF-Token (que exige JS da mesma origem) já protege
  return true;
}

export function protegerCsrf(req, _res, next) {
  if (SEGUROS.has(req.method)) return next();
  const doCookie = req.cookies?.[config.sessao.cookieCsrf];
  const doCabecalho = req.get('x-csrf-token');
  if (!origemPermitida(req) || !iguais(doCookie, doCabecalho)) {
    return next(erros.proibido('Sessão expirada. Recarregue a página e tente de novo.'));
  }
  next();
}
