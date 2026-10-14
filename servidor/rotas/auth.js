// Contas: cadastro, entrar, sair, verificar e-mail, esqueci e redefinir senha.
import { Router } from 'express';
import { config } from '../config.js';
import { consulta, umaLinha, transacao } from '../db/index.js';
import * as modelos from '../emails/modelos.js';
import { acordarEntregador, enfileirarEmail } from '../emails/fila.js';
import { ErroApp, erros } from '../lib/erros.js';
import { log } from '../lib/log.js';
import { conferirSenha, conferirSenhaFicticia, hashSenha, motivoSenhaFraca } from '../lib/seguranca.js';
import { campos, esquemasBiometria, validar, z } from '../lib/validacao.js';
import { garantirTokenCsrf } from '../middlewares/csrf.js';
import { limites } from '../middlewares/limites.js';
import { encerrarSessao, encerrarTodas, exigirLogin, iniciarSessao } from '../middlewares/sessao.js';
import { auditar } from '../servicos/auditoria.js';
import { concluirEntrada, opcoesEntrada } from '../servicos/biometria.js';
import { criarAviso } from '../servicos/eventos.js';
import { consumirToken, criarTokenUsoUnico, rota, usuarioPublico } from './comum.js';

export const rotasAuth = Router();

const COLUNAS_USUARIO = 'id, nome, email, telefone, papel, email_verificado_em, marketing, preferencias, senha_hash, tentativas_falhas, bloqueado_ate';
const MAX_FALHAS = 8;

/** Depois de login/cadastro o token CSRF também muda. */
function renovarCsrf(req, res) {
  delete req.cookies[config.sessao.cookieCsrf];
  return garantirTokenCsrf(req, res);
}

// ------------------------------------------------------------------ cadastro
const esquemaCadastro = z.object({
  nome: campos.nome,
  email: campos.email,
  telefone: campos.telefone,
  senha: campos.senha,
  aceite: z.literal(true, { error: 'Para criar a conta, aceite os termos de uso e a política de privacidade.' }),
  marketing: z.boolean().optional().default(false),
});

rotasAuth.post('/cadastro', limites.cadastro, validar(esquemaCadastro), rota(async (req, res) => {
  const d = req.dados;
  const fraca = motivoSenhaFraca(d.senha, d);
  if (fraca) throw erros.validacao({ senha: fraca });
  if (await umaLinha('SELECT id FROM usuarios WHERE email = ?', [d.email])) {
    throw erros.conflito('Esse e-mail já tem conta. Entre ou recupere a senha.', 'email_em_uso');
  }
  const senhaHash = await hashSenha(d.senha);
  let usuarioId;
  try {
    usuarioId = await transacao(async (conn) => {
      const r = await consulta('INSERT INTO usuarios (nome, email, telefone, senha_hash, marketing) VALUES (?, ?, ?, ?, ?)', [
        d.nome, d.email, d.telefone ?? null, senhaHash, d.marketing ? 1 : 0,
      ], conn);
      const id = r.insertId;
      const ip = req.ip?.slice(0, 45) ?? null;
      for (const [tipo, versao, aceito] of [['termos', config.versaoTermos, 1], ['privacidade', config.versaoPrivacidade, 1], ['marketing', config.versaoPrivacidade, d.marketing ? 1 : 0]]) {
        await consulta('INSERT INTO consentimentos (usuario_id, tipo, versao, aceito, ip) VALUES (?, ?, ?, ?, ?)', [id, tipo, versao, aceito, ip], conn);
      }
      const token = await criarTokenUsoUnico(conn, id, 'verificar_email', 48);
      await enfileirarEmail(conn, { para: d.email, ...modelos.verificarEmail({ nome: d.nome, link: `${config.appUrl}/verificar-email?token=${token}` }) });
      await criarAviso(conn, { usuarioId: id, tipo: 'boas_vindas', titulo: 'Bem-vindo à Barbearia do Fortão', corpo: 'Confirme seu e-mail para receber confirmações e lembretes.', link: '/conta' });
      return id;
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw erros.conflito('Esse e-mail já tem conta. Entre ou recupere a senha.', 'email_em_uso');
    throw e;
  }
  acordarEntregador();
  await iniciarSessao(req, res, usuarioId);
  const csrf = renovarCsrf(req, res);
  await auditar({ usuarioId, acao: 'cadastro', ip: req.ip });
  const usuario = await umaLinha(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ?`, [usuarioId]);
  res.status(201).json({ usuario: usuarioPublico(usuario), csrf });
}));

// ------------------------------------------------------------------ entrar
rotasAuth.post('/entrar', limites.entrar, validar(z.object({ email: campos.email, senha: campos.senha })), rota(async (req, res) => {
  const { email, senha } = req.dados;
  const u = await umaLinha(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE email = ? AND excluido_em IS NULL`, [email]);
  const falha = () => new ErroApp(401, 'E-mail ou senha incorretos.', { codigo: 'credenciais' });
  if (!u) {
    await conferirSenhaFicticia(senha);
    throw falha();
  }
  if (u.bloqueado_ate && new Date(u.bloqueado_ate).getTime() > Date.now()) {
    const min = Math.ceil((new Date(u.bloqueado_ate).getTime() - Date.now()) / 60000);
    throw erros.muitas(`Muitas tentativas erradas. Tente de novo em ${min} min ou redefina a senha.`);
  }
  if (!(await conferirSenha(u.senha_hash, senha))) {
    await consulta(
      'UPDATE usuarios SET tentativas_falhas = tentativas_falhas + 1, bloqueado_ate = IF(tentativas_falhas >= ?, UTC_TIMESTAMP() + INTERVAL 15 MINUTE, NULL) WHERE id = ?',
      [MAX_FALHAS, u.id],
    );
    await auditar({ usuarioId: u.id, acao: 'login_falhou', ip: req.ip });
    throw falha();
  }
  await consulta('UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?', [u.id]);
  if (req.sessao) await encerrarSessao(req, res);
  await iniciarSessao(req, res, u.id);
  const csrf = renovarCsrf(req, res);
  await auditar({ usuarioId: u.id, acao: 'login', ip: req.ip });
  res.json({ usuario: usuarioPublico(u), csrf });
}));

// ------------------------------------------------------------------ entrar com biometria
// Quem já tem conta ativa a biometria no perfil; daí em diante entra com a digital, o rosto ou o PIN do aparelho.
rotasAuth.post('/biometria/opcoes', limites.biometria, rota(async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ opcoes: await opcoesEntrada() });
}));

rotasAuth.post('/biometria/entrar', limites.entrar, validar(z.object({ resposta: esquemasBiometria.entrada })), rota(async (req, res) => {
  let usuarioId;
  try {
    usuarioId = await concluirEntrada(req.dados.resposta);
  } catch (e) {
    await auditar({ acao: 'login_biometria_falhou', ip: req.ip });
    throw e;
  }
  const u = await umaLinha(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ?`, [usuarioId]);
  if (req.sessao) await encerrarSessao(req, res);
  await iniciarSessao(req, res, u.id);
  const csrf = renovarCsrf(req, res);
  await auditar({ usuarioId: u.id, acao: 'login_biometria', ip: req.ip });
  res.json({ usuario: usuarioPublico(u), csrf });
}));

// ------------------------------------------------------------------ sair
rotasAuth.post('/sair', rota(async (req, res) => {
  await encerrarSessao(req, res);
  const csrf = renovarCsrf(req, res);
  res.json({ ok: true, csrf });
}));

// ------------------------------------------------------------------ verificar e-mail
rotasAuth.post('/verificar-email', validar(z.object({ token: campos.token })), rota(async (req, res) => {
  const ok = await transacao(async (conn) => {
    const usuarioId = await consumirToken(conn, req.dados.token, 'verificar_email');
    if (!usuarioId) return false;
    await consulta('UPDATE usuarios SET email_verificado_em = COALESCE(email_verificado_em, UTC_TIMESTAMP()) WHERE id = ?', [usuarioId], conn);
    return true;
  });
  if (!ok) throw erros.requisicao('Esse link expirou ou já foi usado. Entre na conta e peça outro.', { codigo: 'token_invalido' });
  res.json({ ok: true });
}));

rotasAuth.post('/reenviar-verificacao', exigirLogin, limites.senha, rota(async (req, res) => {
  if (req.usuario.email_verificado_em) return res.json({ ok: true, ja_verificado: true });
  await transacao(async (conn) => {
    const token = await criarTokenUsoUnico(conn, req.usuario.id, 'verificar_email', 48);
    await enfileirarEmail(conn, { para: req.usuario.email, ...modelos.verificarEmail({ nome: req.usuario.nome, link: `${config.appUrl}/verificar-email?token=${token}` }) });
  });
  acordarEntregador();
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ esqueci a senha
const MENSAGEM_ESQUECI = 'Se esse e-mail tiver conta, você vai receber um link para criar uma senha nova em instantes.';

rotasAuth.post('/esqueci-senha', limites.senha, validar(z.object({ email: campos.email })), rota(async (req, res) => {
  // Responde igual exista ou não a conta, e só depois faz o trabalho: o tempo de resposta também não denuncia nada
  res.json({ ok: true, mensagem: MENSAGEM_ESQUECI });
  try {
    const u = await umaLinha('SELECT id, nome, email FROM usuarios WHERE email = ? AND excluido_em IS NULL', [req.dados.email]);
    if (!u) return;
    await transacao(async (conn) => {
      const token = await criarTokenUsoUnico(conn, u.id, 'redefinir_senha', 1);
      await enfileirarEmail(conn, { para: u.email, ...modelos.redefinirSenha({ nome: u.nome, link: `${config.appUrl}/redefinir-senha?token=${token}` }) });
    });
    acordarEntregador();
    await auditar({ usuarioId: u.id, acao: 'pediu_redefinicao', ip: req.ip });
  } catch (e) {
    log.erro('esqueci_senha', { erro: e.message });
  }
}));

rotasAuth.post('/redefinir-senha', limites.senha, validar(z.object({ token: campos.token, senha: campos.senha })), rota(async (req, res) => {
  const { token, senha } = req.dados;
  const novoHash = await hashSenha(senha);
  const usuario = await transacao(async (conn) => {
    const usuarioId = await consumirToken(conn, token, 'redefinir_senha');
    if (!usuarioId) throw erros.requisicao('Esse link expirou ou já foi usado. Peça um novo.', { codigo: 'token_invalido' });
    const u = await umaLinha('SELECT id, nome, email FROM usuarios WHERE id = ? AND excluido_em IS NULL', [usuarioId], conn);
    if (!u) throw erros.requisicao('Conta não encontrada.', { codigo: 'token_invalido' });
    const fraca = motivoSenhaFraca(senha, u);
    if (fraca) throw erros.validacao({ senha: fraca });
    // Quem abriu o link do e-mail provou que é dono do endereço
    await consulta(
      'UPDATE usuarios SET senha_hash = ?, tentativas_falhas = 0, bloqueado_ate = NULL, email_verificado_em = COALESCE(email_verificado_em, UTC_TIMESTAMP()) WHERE id = ?',
      [novoHash, u.id], conn,
    );
    await encerrarTodas(u.id, null, conn);
    await enfileirarEmail(conn, { para: u.email, ...modelos.senhaAlterada({ nome: u.nome }) });
    return u;
  });
  acordarEntregador();
  await iniciarSessao(req, res, usuario.id);
  const csrf = renovarCsrf(req, res);
  await auditar({ usuarioId: usuario.id, acao: 'redefiniu_senha', ip: req.ip });
  const u = await umaLinha(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ?`, [usuario.id]);
  res.json({ usuario: usuarioPublico(u), csrf });
}));

