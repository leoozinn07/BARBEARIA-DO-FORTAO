// Cria (ou promove) a conta admin do Fortão.
// Uso: npm run admin:criar -- --email fortao@exemplo.com --nome "Fortão" [--senha "SenhaForte!2026"]
// Sem --senha, uma senha forte é gerada e mostrada uma única vez.
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { executar, umaLinha, fecharPool } from '../servidor/db/index.js';
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
const { id } = await umaLinha(
  `INSERT INTO usuarios (nome, email, senha_hash, papel, email_verificado_em) VALUES ($1, $2, $3, 'admin', now())
   ON CONFLICT (email) DO UPDATE SET papel = 'admin', senha_hash = EXCLUDED.senha_hash, nome = EXCLUDED.nome,
     email_verificado_em = COALESCE(usuarios.email_verificado_em, now()), excluido_em = NULL, tentativas_falhas = 0, bloqueado_ate = NULL
   RETURNING id`,
  [values.nome, email, hash],
);
await executar('UPDATE barbeiros SET usuario_id = $1 WHERE id = $2', [id, barbeiroId]);
console.log(`\nAdmin pronto: ${email}`);
if (!values.senha) console.log(`Senha gerada (anote agora, ela não aparece de novo): ${senha}`);
console.log('Entre em /entrar e o painel fica em /admin.\n');
await fecharPool();
