// Aplica, em ordem, os arquivos .sql de migracoes/ que ainda não rodaram neste banco.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { log } from '../lib/log.js';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migracoes');

export async function migrar() {
  // Conexão própria com multipleStatements, só para rodar os arquivos de migração
  const conn = await mysql.createConnection({ ...config.mysql, multipleStatements: true, timezone: 'Z' });
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`CREATE TABLE IF NOT EXISTS migracoes (
      nome VARCHAR(120) PRIMARY KEY,
      aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    // Trava nomeada: duas instâncias subindo juntas não aplicam a mesma migração duas vezes
    await conn.query("SELECT GET_LOCK('fortao_migracoes', 30)");
    const [feitas] = await conn.query('SELECT nome FROM migracoes');
    const aplicadas = new Set(feitas.map((l) => l.nome));
    const arquivos = (await readdir(PASTA)).filter((a) => a.endsWith('.sql')).sort();
    let novas = 0;
    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;
      const sql = await readFile(path.join(PASTA, arquivo), 'utf8');
      await conn.query(sql);
      await conn.query('INSERT INTO migracoes (nome) VALUES (?)', [arquivo]);
      log.info('migracao_aplicada', { arquivo });
      novas++;
    }
    await conn.query("SELECT RELEASE_LOCK('fortao_migracoes')");
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
