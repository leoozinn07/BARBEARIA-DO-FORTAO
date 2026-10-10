// Cria (ou promove) a conta admin do Fortão.
// Uso: npm run admin:criar -- --email fortao@exemplo.com --nome "Fortão" [--senha "SenhaForte!2026"]
// Sem --senha, uma senha forte é gerada e mostrada uma única vez.
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { consulta, umaLinha, fecharPool } from '../servidor/db/index.js';
import { migrar } from '../servidor/db/migrar.js';
import { semear } from '../servidor/db/semear.js';
import { hashSenha, motivoSenhaFraca } from '../servidor/lib/seguranca.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, nome: { type: 'string', default: 'Fortão' }, senha: { type: 'string' } } });
const email = String(values.email || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Informe o e-mail: npm run admin:criar -- --email fortao@exemplo.com');
  process.exit(1);
}
const senha = values.senha || randomBytes(12).toString('base64url');
const fraca = motivoSenhaFraca(senha, { email, nome: values.nome });
if (fraca) {
  console.error(`Senha fraca: ${fraca}`);
  process.exit(1);
}

await migrar();
const barbeiroId = await semear();
const hash = await hashSenha(senha);
const existente = await umaLinha('SELECT id FROM usuarios WHERE email = ?', [email]);
let id;
if (existente) {
  await consulta("UPDATE usuarios SET papel = 'admin', senha_hash = ?, nome = ?, email_verificado_em = COALESCE(email_verificado_em, UTC_TIMESTAMP()), excluido_em = NULL WHERE id = ?", [hash, values.nome, existente.id]);
  id = existente.id;
} else {
  const r = await consulta("INSERT INTO usuarios (nome, email, senha_hash, papel, email_verificado_em) VALUES (?, ?, ?, 'admin', UTC_TIMESTAMP())", [values.nome, email, hash]);
  id = r.insertId;
}
await consulta('UPDATE barbeiros SET usuario_id = ? WHERE id = ?', [id, barbeiroId]);
console.log(`\nAdmin pronto: ${email}`);
if (!values.senha) console.log(`Senha gerada (anote agora, ela não aparece de novo): ${senha}`);
console.log('Entre em /entrar e o painel fica em /admin.\n');
await fecharPool();
