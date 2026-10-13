// Registro de ações sensíveis (admin e segurança). Sem senha, token ou conteúdo pessoal desnecessário.
import { executar } from '../db/index.js';
import { log } from '../lib/log.js';

export async function auditar({ usuarioId = null, acao, alvo = null, detalhes = null, ip = null }, conn) {
  try {
    await executar(
      'INSERT INTO auditoria (usuario_id, acao, alvo, detalhes, ip) VALUES ($1, $2, $3, $4, $5)',
      [usuarioId, acao, alvo, detalhes ? JSON.stringify(detalhes) : null, ip ? String(ip).slice(0, 45) : null],
      conn,
    );
  } catch (e) {
    log.erro('auditoria_falhou', { acao, erro: e.message });
  }
}
