// Utilidades compartilhadas pelas rotas.
import { consulta } from '../db/index.js';
import { gerarToken, hashToken } from '../lib/seguranca.js';

/** Envolve handlers async para que erros cheguem ao tratador central. */
export const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Dados do usuário que podem ir para o navegador. */
export function usuarioPublico(u) {
  if (!u) return null;
  const prefs = typeof u.preferencias === 'string' ? JSON.parse(u.preferencias) : u.preferencias;
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
  await consulta('UPDATE tokens_uso_unico SET usado_em = UTC_TIMESTAMP() WHERE usuario_id = ? AND tipo = ? AND usado_em IS NULL', [usuarioId, tipo], conn);
  const token = gerarToken();
  await consulta('INSERT INTO tokens_uso_unico (usuario_id, tipo, token_hash, expira_em) VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? HOUR)', [
    usuarioId, tipo, hashToken(token), horas,
  ], conn);
  return token;
}

/** Consome um token válido (marca como usado) e devolve o usuario_id, ou null. */
export async function consumirToken(conn, token, tipo) {
  const linha = (await consulta(
    `SELECT id, usuario_id FROM tokens_uso_unico
      WHERE token_hash = ? AND tipo = ? AND usado_em IS NULL AND expira_em > UTC_TIMESTAMP() FOR UPDATE`,
    [hashToken(token), tipo],
    conn,
  ))[0];
  if (!linha) return null;
  await consulta('UPDATE tokens_uso_unico SET usado_em = UTC_TIMESTAMP() WHERE id = ?', [linha.id], conn);
  return linha.usuario_id;
}
