// Configuração lida do ambiente (.env). Nenhum segredo fica no código.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const arquivoEnv = process.env.ARQUIVO_ENV || path.join(RAIZ, '.env');
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const env = process.env;
const bool = (v, padrao = false) => (v === undefined || v === '' ? padrao : ['1', 'true', 'sim', 'yes'].includes(String(v).toLowerCase()));
const num = (v, padrao) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? padrao : Number(v));

// Na Vercel cada pedido roda numa função: sem processo contínuo, pasta só de leitura (fora /tmp) e HTTPS sempre
const vercel = bool(env.VERCEL, false);
const producao = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
const urlVercel = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
const appUrl = (env.APP_URL || (urlVercel ? `https://${urlVercel}` : `http://localhost:${num(env.PORTA, 3000)}`)).replace(/\/$/, '');

/** Banco por URL (mysql://usuario:senha@host:porta/banco?ssl-mode=REQUIRED), como os provedores entregam, ou por partes. */
function bancoMysql() {
  const ssl = bool(env.MYSQL_SSL, false) || /ssl-mode=(required|verify)/i.test(env.MYSQL_URL || '');
  const tls = ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true, ...(env.MYSQL_SSL_CA ? { ca: env.MYSQL_SSL_CA.replace(/\\n/g, '\n') } : {}) } : undefined;
  if (env.MYSQL_URL) {
    const u = new URL(env.MYSQL_URL);
    return {
      host: u.hostname, port: num(u.port, 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'fortao', ssl: tls,
    };
  }
  return {
    host: env.MYSQL_HOST || '127.0.0.1',
    port: num(env.MYSQL_PORTA, 3306),
    user: env.MYSQL_USUARIO || 'fortao',
    password: env.MYSQL_SENHA || '',
    database: env.MYSQL_BANCO || 'fortao',
    ssl: tls,
  };
}

export const config = {
  producao,
  porta: num(env.PORTA, 3000),
  appUrl,
  origem: new URL(appUrl).origin,
  vercel,
  confiarProxy: num(env.CONFIAR_PROXY, producao || vercel ? 1 : 0),
  autoMigrar: bool(env.AUTO_MIGRAR, true),
  // Na Vercel não há processo contínuo: as rotinas rodam por /api/rotinas (agendado no GitHub e na Vercel)
  agendadorAtivo: bool(env.AGENDADOR_ATIVO, !vercel),
  segredoRotinas: env.CRON_SECRET || '',
  limitesDesligados: bool(env.LIMITES_DESLIGADOS, false),

  mysql: bancoMysql(),

  sessao: {
    // __Host- exige HTTPS, path=/ e nenhum domínio: o navegador recusa o cookie em qualquer outro cenário.
    cookie: producao ? '__Host-fortao' : 'fortao_sessao',
    cookieCsrf: producao ? '__Host-fortao-csrf' : 'fortao_csrf',
    diasValidade: num(env.SESSAO_DIAS, 30),
  },

  email: {
    // Com a chave da API do Brevo, os e-mails saem por ela e o SMTP é ignorado (passo a passo em docs/deploy.md)
    brevoChave: env.BREVO_API_KEY || '',
    host: env.SMTP_HOST || '',
    port: num(env.SMTP_PORTA, 587),
    secure: bool(env.SMTP_SEGURO, false),
    user: env.SMTP_USUARIO || '',
    pass: env.SMTP_SENHA || '',
    remetente: env.EMAIL_REMETENTE || 'Barbearia do Fortão <nao-responda@localhost>',
    admin: env.EMAIL_ADMIN || '',
    pastaLocal: vercel ? path.join(tmpdir(), 'emails') : path.join(RAIZ, 'var', 'emails'),
  },

  versaoTermos: env.VERSAO_TERMOS || '2026-10-13',
  versaoPrivacidade: env.VERSAO_PRIVACIDADE || '2026-10-13',
};

export const FUSO = 'America/Sao_Paulo';
