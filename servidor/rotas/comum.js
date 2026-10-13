// Utilidades compartilhadas pelas rotas.
import { executar, umaLinha } from '../db/index.js';
import { gerarToken, hashToken } from '../lib/seguranca.js';

/** Envolve handlers async para que erros cheguem ao tratador central. */
export const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Dados do usuário que podem ir para o navegador. */
export function usuarioPublico(u) {
  if (!u) return null;
  const prefs = u.preferencias;
  return {
    nome: u.nome,
    email: u.email,
    telefone: u.telefone,
    papel: u.papel,
    email_verificado: Boolean(u.email_verificado_em),
    marketing: Boolean(u.marketing),
    preferencias: { tema: 'escuro', letra_grande: false, ...(prefs || {}) },
  };
}

/** Cria token de uso único (verificar e-mail, redefinir senha) e invalida os anteriores do mesmo tipo. */
export async function criarTokenUsoUnico(conn, usuarioId, tipo, horas) {
  await executar('UPDATE tokens_uso_unico SET usado_em = now() WHERE usuario_id = $1 AND tipo = $2 AND usado_em IS NULL', [usuarioId, tipo], conn);
  const token = gerarToken();
  await executar('INSERT INTO tokens_uso_unico (usuario_id, tipo, token_hash, expira_em) VALUES ($1, $2, $3, now() + make_interval(hours => $4))', [
    usuarioId, tipo, hashToken(token), horas,
  ], conn);
  return token;
}

/** Consome um token válido (marca como usado) e devolve o usuario_id, ou null. */
export async function consumirToken(conn, token, tipo) {
  // Um UPDATE só marca e devolve: dois cliques no mesmo link nunca usam o token duas vezes
  const linha = await umaLinha(
    `UPDATE tokens_uso_unico SET usado_em = now()
      WHERE token_hash = $1 AND tipo = $2 AND usado_em IS NULL AND expira_em > now() RETURNING usuario_id`,
    [hashToken(token), tipo],
    conn,
  );
  return linha?.usuario_id ?? null;
}
