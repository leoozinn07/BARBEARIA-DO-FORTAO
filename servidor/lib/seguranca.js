// Senhas (argon2id), tokens aleatórios e comparação em tempo constante.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Parâmetros recomendados pela OWASP para argon2id (19 MiB, 2 iterações)
const OPCOES_ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashSenha = (senha) => hash(senha, OPCOES_ARGON);
export async function conferirSenha(hashSalvo, senha) {
  try {
    return await verify(hashSalvo, senha);
  } catch {
    return false;
  }
}

// Hash "falso" usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois casos
let hashFicticio;
export async function conferirSenhaFicticia(senha) {
  hashFicticio ||= await hashSenha('senha-ficticia-para-tempo-constante');
  await conferirSenha(hashFicticio, senha);
  return false;
}

/** Token aleatório de 256 bits em base64url. Só o hash vai para o banco. */
export const gerarToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export function iguais(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

// Código curto do agendamento, sem letras que confundem (0/O, 1/I/L)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function gerarCodigo(tamanho = 8) {
  let c = '';
  for (let i = 0; i < tamanho; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

const COMUNS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', 'abcd1234', 'abc12345',
  'password', 'password1', 'senha123', 'senha1234', 'senhasenha', 'qwerty123', 'qwertyui', 'asdfghjk', 'iloveyou',
  'brasil123', 'flamengo', 'corinthians', 'palmeiras', 'saopaulo', 'santos123', 'mudar123', 'admin123', 'fortao123',
  'barbearia', 'barbearia1', 'cohab123', 'cohab5', 'cohab555', 'vasco123', 'gremio123', 'teste123', 'teste1234',
]);

/** Devolve um motivo em português se a senha for fraca, ou null se estiver boa. */
export function motivoSenhaFraca(senha, { email = '', nome = '' } = {}) {
  if (typeof senha !== 'string' || senha.length < 8) return 'Use pelo menos 8 caracteres.';
  if (senha.length > 128) return 'Use no máximo 128 caracteres.';
  const s = senha.toLowerCase();
  if (COMUNS.has(s) || /^(.)\1+$/.test(s)) return 'Essa senha é muito comum. Escolha outra.';
  const usuario = email.split('@')[0]?.toLowerCase();
  if (usuario && usuario.length >= 4 && s.includes(usuario)) return 'A senha não pode conter o seu e-mail.';
  const primeiroNome = nome.trim().split(/\s+/)[0]?.toLowerCase();
  if (primeiroNome && primeiroNome.length >= 4 && s === primeiroNome) return 'A senha não pode ser o seu nome.';
  return null;
}
