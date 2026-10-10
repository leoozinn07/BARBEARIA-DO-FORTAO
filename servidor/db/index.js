// Pool de conexões MySQL. Tudo em UTC: o fuso de São Paulo só entra na hora de exibir e de montar a agenda.
import mysql from 'mysql2/promise';
import { config } from '../config.js';

let pool;

export function obterPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.mysql,
      timezone: 'Z',
      charset: 'utf8mb4_0900_ai_ci',
      connectionLimit: 10,
      waitForConnections: true,
      decimalNumbers: true,
    });
    // Toda conexão nova trabalha em UTC (DEFAULT CURRENT_TIMESTAMP e NOW() também)
    pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  }
  return pool;
}

/** Executa uma consulta e devolve as linhas (SELECT) ou o resultado (INSERT/UPDATE). */
export async function consulta(sql, params = [], conn) {
  // query() escapa os parâmetros no cliente; evita o erro de LIMIT ? do execute() no MySQL 8
  const [linhas] = await (conn || obterPool()).query(sql, params);
  return linhas;
}

export async function umaLinha(sql, params = [], conn) {
  const linhas = await consulta(sql, params, conn);
  return linhas[0] || null;
}

/**
 * Roda `fn(conn)` dentro de uma transação. Faz rollback em qualquer erro.
 * READ COMMITTED: cada leitura vê o que já foi gravado por outras transações. Depois de travar o dia
 * da agenda, a checagem de conflito enxerga um agendamento que outra pessoa acabou de confirmar.
 */
// Impasse (1213) e espera de trava estourada (1205): o MySQL desfez tudo, então dá para repetir com segurança
const REPETIVEIS = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

export async function transacao(fn, { tentativas = 3 } = {}) {
  for (let tentativa = 1; ; tentativa++) {
    const conn = await obterPool().getConnection();
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await conn.beginTransaction();
      const resultado = await fn(conn);
      await conn.commit();
      return resultado;
    } catch (erro) {
      await conn.rollback().catch(() => {});
      if (!REPETIVEIS.has(erro.code) || tentativa >= tentativas) throw erro;
      await new Promise((r) => setTimeout(r, 20 * tentativa + Math.random() * 30));
    } finally {
      conn.release();
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
