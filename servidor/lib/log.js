// Log em JSON de uma linha (fácil de ler em qualquer hospedagem). Nunca registre senha, token ou dado sensível.
import { config } from '../config.js';

function escrever(nivel, evento, dados = {}) {
  if (config.testes && nivel !== 'erro' && !process.env.LOG_TESTES) return;
  const linha = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...dados });
  (nivel === 'erro' ? process.stderr : process.stdout).write(linha + '\n');
}

export const log = {
  info: (evento, dados) => escrever('info', evento, dados),
  aviso: (evento, dados) => escrever('aviso', evento, dados),
  erro: (evento, dados) => escrever('erro', evento, dados),
};
