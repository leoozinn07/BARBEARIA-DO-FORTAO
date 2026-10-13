// Conexão com o Postgres (Supabase em produção). Tudo em UTC: o fuso de São Paulo só entra ao exibir e montar a agenda.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { config } from '../config.js';
import { log } from '../lib/log.js';

// COUNT, SUM e ids (bigint/numeric) chegam como texto no pg. Os valores daqui cabem em Number com folga.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

const LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Lê a DATABASE_URL e monta o TLS: fora da própria máquina a conexão é sempre criptografada e o certificado
 * do servidor é conferido (com o certificado do Supabase em DATABASE_CA). Parâmetros ssl* da URL são ignorados
 * para que nada na URL desligue essa conferência.
 */
export function opcoesConexao() {
  if (!config.banco.url) throw new Error('Defina DATABASE_URL no .env (passo a passo em docs/deploy.md).');
  const url = new URL(config.banco.url);
  for (const p of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslpassword', 'uselibpqcompat']) url.searchParams.delete(p);
  const ca = config.banco.ca ? readFileSync(config.banco.ca, 'utf8') : undefined;
  return {
    connectionString: url.toString(),
    ssl: LOCAIS.has(url.hostname) ? false : { rejectUnauthorized: true, ca },
    application_name: 'barbearia-do-fortao',
  };
}

/** As tabelas ficam no schema "barbearia", fora da API automática do Supabase. */
export const PREPARAR_SESSAO = 'SET search_path TO barbearia, public';

let pool;
const preparadas = new WeakSet();

function obterPool() {
  if (!pool) {
    pool = new pg.Pool({ ...opcoesConexao(), max: config.banco.conexoes, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
    // Conexão ociosa derrubada pelo servidor: o pool descarta e abre outra quando precisar
    pool.on('error', (e) => log.aviso('banco_conexao_caiu', { erro: e.message }));
  }
  return pool;
}

/** Pega uma conexão do pool já apontando para o schema certo (o SET roda uma vez por conexão). */
async function conectar() {
  const conn = await obterPool().connect();
  if (!preparadas.has(conn)) {
    try {
      await conn.query(PREPARAR_SESSAO);
    } catch (e) {
      conn.release(true);
      throw e;
    }
    preparadas.add(conn);
  }
  return conn;
}

async function rodar(sql, params, conn) {
  if (conn) return conn.query(sql, params);
  const propria = await conectar();
  try {
    return await propria.query(sql, params);
  } finally {
    propria.release();
  }
}

/** Executa uma consulta e devolve as linhas. */
export async function consulta(sql, params = [], conn) {
  return (await rodar(sql, params, conn)).rows;
}

export async function umaLinha(sql, params = [], conn) {
  const linhas = await consulta(sql, params, conn);
  return linhas[0] || null;
}

/** INSERT/UPDATE/DELETE sem RETURNING: devolve quantas linhas mudaram. */
export async function executar(sql, params = [], conn) {
  return (await rodar(sql, params, conn)).rowCount;
}

/** Códigos de erro do Postgres usados pelo app. */
export const PG = {
  unico: '23505',
  sobreposicao: '23P01',
};

// Impasse e falha de serialização: o Postgres desfez tudo, então dá para repetir com segurança
const REPETIVEIS = new Set(['40P01', '40001']);

/**
 * Roda `fn(conn)` dentro de uma transação (READ COMMITTED, o padrão do Postgres) e faz rollback em qualquer erro.
 * Cada leitura vê o que já foi gravado por outras transações: depois de travar o dia da agenda, a checagem de
 * conflito enxerga um horário que outra pessoa acabou de confirmar.
 */
export async function transacao(fn, { tentativas = 3 } = {}) {
  for (let tentativa = 1; ; tentativa++) {
    const conn = await conectar();
    let descartar = false;
    try {
      await conn.query('BEGIN');
      const resultado = await fn(conn);
      await conn.query('COMMIT');
      return resultado;
    } catch (erro) {
      await conn.query('ROLLBACK').catch(() => { descartar = true; });
      if (!REPETIVEIS.has(erro.code) || tentativa >= tentativas) throw erro;
      await new Promise((r) => setTimeout(r, 20 * tentativa + Math.random() * 30));
    } finally {
      conn.release(descartar);
    }
  }
}

export async function fecharPool() {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}
