// Configuração lida do ambiente (.env). Nenhum segredo fica no código.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const arquivoEnv = process.env.ARQUIVO_ENV || path.join(RAIZ, '.env');
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const env = process.env;
const bool = (v, padrao = false) => (v === undefined || v === '' ? padrao : ['1', 'true', 'sim', 'yes'].includes(String(v).toLowerCase()));
const num = (v, padrao) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? padrao : Number(v));

const producao = env.NODE_ENV === 'production';
const appUrl = (env.APP_URL || `http://localhost:${num(env.PORTA, 3000)}`).replace(/\/$/, '');

export const config = {
  producao,
  porta: num(env.PORTA, 3000),
  appUrl,
  origem: new URL(appUrl).origin,
  confiarProxy: num(env.CONFIAR_PROXY, producao ? 1 : 0),
  autoMigrar: bool(env.AUTO_MIGRAR, true),
  agendadorAtivo: bool(env.AGENDADOR_ATIVO, true),
  limitesDesligados: bool(env.LIMITES_DESLIGADOS, false),

  banco: {
    // Supabase: Project Settings > Database > Connection string > Session pooler
    url: env.DATABASE_URL || '',
    // Certificado do Supabase (Database > SSL Configuration > Download certificate)
    ca: env.DATABASE_CA ? path.resolve(RAIZ, env.DATABASE_CA) : '',
    conexoes: num(env.DATABASE_CONEXOES, 5),
  },

  sessao: {
    // __Host- exige HTTPS, path=/ e nenhum domínio: o navegador recusa o cookie em qualquer outro cenário.
    cookie: producao ? '__Host-fortao' : 'fortao_sessao',
    cookieCsrf: producao ? '__Host-fortao-csrf' : 'fortao_csrf',
    diasValidade: num(env.SESSAO_DIAS, 30),
  },

  email: {
    host: env.SMTP_HOST || '',
    port: num(env.SMTP_PORTA, 587),
    secure: bool(env.SMTP_SEGURO, false),
    user: env.SMTP_USUARIO || '',
    pass: env.SMTP_SENHA || '',
    remetente: env.EMAIL_REMETENTE || 'Barbearia do Fortão <nao-responda@localhost>',
    admin: env.EMAIL_ADMIN || '',
    pastaLocal: path.join(RAIZ, 'var', 'emails'),
  },

  versaoTermos: env.VERSAO_TERMOS || '2026-10-10',
  versaoPrivacidade: env.VERSAO_PRIVACIDADE || '2026-10-10',
};

export const FUSO = 'America/Sao_Paulo';
