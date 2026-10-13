// Entrar com biometria (passkeys / WebAuthn). A digital, o rosto ou o PIN são conferidos pelo próprio aparelho,
// que assina um desafio com uma chave privada que nunca sai dele. O site guarda só a chave pública.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { config } from '../config.js';
import { consulta, executar, umaLinha } from '../db/index.js';
import { ErroApp, erros } from '../lib/erros.js';
import { gerarToken, hashToken } from '../lib/seguranca.js';

const RP_ID = new URL(config.origem).hostname;
const RP_NOME = 'Barbearia do Fortão';
const VALIDADE_DESAFIO_MIN = 5;
const TEMPO_LIMITE_MS = 120000;

async function guardarDesafio(desafio, tipo, usuarioId = null) {
  await consulta('INSERT INTO biometria_desafios (desafio_hash, tipo, usuario_id, expira_em) VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)', [
    hashToken(desafio), tipo, usuarioId, VALIDADE_DESAFIO_MIN,
  ]);
}

/** Confere e apaga o desafio na mesma operação: cada um vale uma única vez. */
const consumirDesafio = (tipo, usuarioId = null) => async (desafio) => {
  const apagou = await executar(
    `DELETE FROM biometria_desafios WHERE desafio_hash = ? AND tipo = ? AND expira_em > UTC_TIMESTAMP() AND ${usuarioId ? 'usuario_id = ?' : 'usuario_id IS NULL'}`,
    usuarioId ? [hashToken(desafio), tipo, usuarioId] : [hashToken(desafio), tipo],
  );
  return apagou === 1;
};

/** Nome simples do aparelho, para o cliente reconhecer na lista ("iPhone", "Android", "Windows"...). */
function nomeDoAparelho(agente = '') {
  const pares = [[/iPhone/, 'iPhone'], [/iPad/, 'iPad'], [/Android/, 'Android'], [/Macintosh|Mac OS X/, 'Mac'], [/Windows/, 'Windows'], [/CrOS/, 'Chromebook'], [/Linux/, 'Linux']];
  return pares.find(([re]) => re.test(agente))?.[1] ?? 'Aparelho';
}

const falhou = (mensagem = 'Não deu para confirmar a biometria. Tente de novo ou entre com e-mail e senha.', codigo = 'biometria') => new ErroApp(401, mensagem, { codigo });

// ------------------------------------------------------------------ ativar num aparelho (conta logada)
export async function opcoesCadastro(usuario) {
  let { biometria_id: idConta } = await umaLinha('SELECT biometria_id FROM usuarios WHERE id = ?', [usuario.id]);
  if (!idConta) {
    idConta = gerarToken(16);
    await consulta('UPDATE usuarios SET biometria_id = ? WHERE id = ? AND biometria_id IS NULL', [idConta, usuario.id]);
    ({ biometria_id: idConta } = await umaLinha('SELECT biometria_id FROM usuarios WHERE id = ?', [usuario.id]));
  }
  const existentes = await consulta('SELECT credencial_id, transportes FROM biometria_credenciais WHERE usuario_id = ?', [usuario.id]);
  const opcoes = await generateRegistrationOptions({
    rpName: RP_NOME,
    rpID: RP_ID,
    userID: Buffer.from(idConta, 'base64url'),
    userName: usuario.email,
    userDisplayName: usuario.nome,
    timeout: TEMPO_LIMITE_MS,
    attestationType: 'none',
    // O mesmo aparelho não cadastra duas vezes
    excludeCredentials: existentes.map((c) => ({ id: c.credencial_id, transports: c.transportes ? c.transportes.split(',') : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    preferredAuthenticatorType: 'localDevice',
  });
  await guardarDesafio(opcoes.challenge, 'cadastro', usuario.id);
  return opcoes;
}

export async function concluirCadastro(usuario, resposta, agente) {
  let verificacao;
  try {
    verificacao = await verifyRegistrationResponse({
      response: resposta,
      expectedChallenge: consumirDesafio('cadastro', usuario.id),
      expectedOrigin: config.origem,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch {
    throw erros.requisicao('Não deu para ativar a biometria. Tente de novo.', { codigo: 'biometria' });
  }
  if (!verificacao.verified) throw erros.requisicao('Não deu para ativar a biometria. Tente de novo.', { codigo: 'biometria' });
  const { credential: c, credentialBackedUp: sincronizada } = verificacao.registrationInfo;
  try {
    const r = await consulta(
      `INSERT INTO biometria_credenciais (usuario_id, credencial_id, chave_publica, contador, transportes, aparelho, sincronizada)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario.id, c.id, Buffer.from(c.publicKey), c.counter, c.transports?.join(',').slice(0, 120) || null, nomeDoAparelho(agente), sincronizada ? 1 : 0],
    );
    return r.insertId;
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw erros.conflito('Esse aparelho já entra com biometria.', 'biometria_existe');
    throw e;
  }
}

export async function listarDaConta(usuarioId) {
  const linhas = await consulta(
    'SELECT id, aparelho, sincronizada, criado_em, ultimo_uso_em FROM biometria_credenciais WHERE usuario_id = ? ORDER BY criado_em DESC',
    [usuarioId],
  );
  return linhas.map((l) => ({ ...l, sincronizada: Boolean(l.sincronizada) }));
}

export async function removerDaConta(usuarioId, id) {
  return executar('DELETE FROM biometria_credenciais WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
}

// ------------------------------------------------------------------ entrar
export async function opcoesEntrada() {
  // Sem lista de credenciais: o aparelho mostra as contas que tem para este site e o cliente só confirma
  const opcoes = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', timeout: TEMPO_LIMITE_MS });
  await guardarDesafio(opcoes.challenge, 'entrada');
  return opcoes;
}

/** Confere a assinatura e devolve o id do usuário dono da credencial. */
export async function concluirEntrada(resposta) {
  const cred = await umaLinha(
    `SELECT b.id, b.usuario_id, b.credencial_id, b.chave_publica, b.contador, b.transportes
       FROM biometria_credenciais b JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.credencial_id = ? AND u.excluido_em IS NULL`,
    [resposta.id],
  );
  // O navegador é avisado (biometria_desconhecida) e pode apagar do aparelho a passkey que não vale mais
  if (!cred) throw falhou('Essa biometria não está ligada a nenhuma conta. Entre com e-mail e senha e ative de novo no seu perfil.', 'biometria_desconhecida');
  let verificacao;
  try {
    verificacao = await verifyAuthenticationResponse({
      response: resposta,
      expectedChallenge: consumirDesafio('entrada'),
      expectedOrigin: config.origem,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: cred.credencial_id,
        publicKey: new Uint8Array(cred.chave_publica),
        counter: Number(cred.contador),
        transports: cred.transportes ? cred.transportes.split(',') : undefined,
      },
    });
  } catch {
    throw falhou();
  }
  if (!verificacao.verified) throw falhou();
  await consulta('UPDATE biometria_credenciais SET contador = ?, sincronizada = ?, ultimo_uso_em = UTC_TIMESTAMP() WHERE id = ?', [
    verificacao.authenticationInfo.newCounter, verificacao.authenticationInfo.credentialBackedUp ? 1 : 0, cred.id,
  ]);
  return cred.usuario_id;
}

export async function limparDesafios() {
  await executar('DELETE FROM biometria_desafios WHERE expira_em < UTC_TIMESTAMP()');
}
