// Aplica, em ordem, os arquivos .sql de migracoes/ que ainda não rodaram neste banco.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { log } from '../lib/log.js';
import { PREPARAR_SESSAO, opcoesConexao } from './index.js';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migracoes');

export async function migrar() {
  // Conexão própria, fora do pool, só para as migrações
  const conn = new pg.Client(opcoesConexao());
  await conn.connect();
  try {
    await conn.query('CREATE SCHEMA IF NOT EXISTS barbearia');
    await conn.query(PREPARAR_SESSAO);
    // Trava da sessão: duas instâncias subindo juntas não aplicam a mesma migração duas vezes
    await conn.query("SELECT pg_advisory_lock(hashtextextended('barbearia:migracoes', 0))");
    await conn.query(`CREATE TABLE IF NOT EXISTS barbearia.migracoes (
      nome varchar(120) PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )`);
    await conn.query('ALTER TABLE barbearia.migracoes ENABLE ROW LEVEL SECURITY');
    const { rows } = await conn.query('SELECT nome FROM barbearia.migracoes');
    const aplicadas = new Set(rows.map((l) => l.nome));
    const arquivos = (await readdir(PASTA)).filter((a) => a.endsWith('.sql')).sort();
    let novas = 0;
    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;
      const sql = await readFile(path.join(PASTA, arquivo), 'utf8');
      // Cada arquivo roda inteiro numa transação: ou entra tudo, ou nada
      await conn.query('BEGIN');
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO barbearia.migracoes (nome) VALUES ($1)', [arquivo]);
        await conn.query('COMMIT');
      } catch (e) {
        await conn.query('ROLLBACK').catch(() => {});
        throw new Error(`${arquivo}: ${e.message}`);
      }
      log.info('migracao_aplicada', { arquivo });
      novas++;
    }
    await conn.query("SELECT pg_advisory_unlock(hashtextextended('barbearia:migracoes', 0))");
    return novas;
  } finally {
    await conn.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrar()
    .then((n) => { log.info('migracoes_ok', { novas: n }); process.exit(0); })
    .catch((e) => { log.erro('migracoes_falharam', { erro: e.message }); process.exit(1); });
}
