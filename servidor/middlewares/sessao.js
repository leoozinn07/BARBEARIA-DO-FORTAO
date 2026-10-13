// Sessões próprias: token aleatório no cookie HttpOnly, só o hash SHA-256 no banco.
import { config } from '../config.js';
import { executar, umaLinha } from '../db/index.js';
import { erros } from '../lib/erros.js';
import { gerarToken, hashToken } from '../lib/seguranca.js';

const DIA = 86400000;

function opcoesCookie(expira) {
  return { httpOnly: true, secure: config.producao, sameSite: 'lax', path: '/', expires: expira };
}

/** Lê o cookie e carrega req.usuario (ou null). Renova a validade no máximo uma vez por hora. */
export async function carregarSessao(req, res, next) {
  req.usuario = null;
  req.sessao = null;
  const token = req.cookies?.[config.sessao.cookie];
  if (!token || token.length > 100) return next();
  try {
    const linha = await umaLinha(
      `SELECT s.id AS sessao_id, s.ultimo_uso_em, u.id, u.nome, u.email, u.telefone, u.papel,
              u.email_verificado_em, u.marketing, u.preferencias, u.criado_em
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = $1 AND s.expira_em > now() AND u.excluido_em IS NULL`,
      [hashToken(token)],
    );
    if (!linha) {
      res.clearCookie(config.sessao.cookie, { path: '/' });
      return next();
    }
    const { sessao_id: sessaoId, ultimo_uso_em: ultimoUso, ...usuario } = linha;
    req.usuario = usuario;
    req.sessao = { id: sessaoId };
    if (Date.now() - new Date(ultimoUso).getTime() > 3600000) {
      const expira = new Date(Date.now() + config.sessao.diasValidade * DIA);
      await executar('UPDATE sessoes SET ultimo_uso_em = now(), expira_em = $1 WHERE id = $2', [expira, sessaoId]);
      res.cookie(config.sessao.cookie, token, opcoesCookie(expira));
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Cria sessão nova (sempre um token novo: evita fixação de sessão). */
export async function iniciarSessao(req, res, usuarioId) {
  const token = gerarToken();
  const expira = new Date(Date.now() + config.sessao.diasValidade * DIA);
  await executar('INSERT INTO sessoes (usuario_id, token_hash, expira_em, ip, agente) VALUES ($1, $2, $3, $4, $5)', [
    usuarioId, hashToken(token), expira, req.ip?.slice(0, 45) ?? null, String(req.get('user-agent') || '').slice(0, 255),
  ]);
  res.cookie(config.sessao.cookie, token, opcoesCookie(expira));
}

export async function encerrarSessao(req, res) {
  if (req.sessao) await executar('DELETE FROM sessoes WHERE id = $1', [req.sessao.id]);
  res.clearCookie(config.sessao.cookie, { path: '/' });
}

/** Encerra todas as sessões do usuário (troca/redefinição de senha), opcionalmente mantendo a atual. */
export async function encerrarTodas(usuarioId, manterSessaoId = null, conn) {
  await executar('DELETE FROM sessoes WHERE usuario_id = $1 AND id <> $2', [usuarioId, manterSessaoId ?? 0], conn);
}

export function exigirLogin(req, _res, next) {
  if (!req.usuario) return next(erros.naoAutenticado());
  next();
}

export function exigirAdmin(req, _res, next) {
  if (!req.usuario) return next(erros.naoAutenticado());
  if (req.usuario.papel !== 'admin') return next(erros.proibido());
  next();
}
