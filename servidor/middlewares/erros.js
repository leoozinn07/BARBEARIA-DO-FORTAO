// Respostas de erro padronizadas. Detalhe técnico vai só para o log, nunca para o cliente.
import path from 'node:path';
import { RAIZ } from '../config.js';
import { ErroApp } from '../lib/erros.js';
import { log } from '../lib/log.js';

export function apiNaoEncontrada(_req, res) {
  res.status(404).json({ erro: 'Rota não encontrada.', codigo: 'nao_encontrado' });
}

export function paginaNaoEncontrada(_req, res) {
  res.status(404).sendFile(path.join(RAIZ, 'publico', '404.html'));
}

// eslint-disable-next-line no-unused-vars
export function tratarErros(erro, req, res, _next) {
  if (erro instanceof ErroApp) {
    return res.status(erro.status).json({ erro: erro.message, codigo: erro.codigo, campos: erro.campos });
  }
  if (erro?.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Pedido inválido.', codigo: 'json_invalido' });
  }
  if (erro?.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Pedido grande demais.', codigo: 'grande_demais' });
  }
  log.erro('erro_interno', { rota: `${req.method} ${req.originalUrl}`, erro: erro?.message, pilha: erro?.stack?.split('\n').slice(0, 4).join(' | ') });
  res.status(500).json({ erro: 'Algo deu errado do nosso lado. Tente de novo em instantes.', codigo: 'interno' });
}
