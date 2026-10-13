// Configurações editáveis pelo painel (endereço, contatos, regras da agenda), com cache curto.
import { consulta, executar } from '../db/index.js';
import { CONFIG_INICIAL } from '../db/semear.js';

let cache = null;
let lidoEm = 0;

export async function lerConfiguracoes() {
  if (cache && Date.now() - lidoEm < 30000) return cache;
  const linhas = await consulta('SELECT chave, valor FROM configuracoes');
  const salvo = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  cache = {
    negocio: { ...CONFIG_INICIAL.negocio, ...(salvo.negocio || {}) },
    agenda: { ...CONFIG_INICIAL.agenda, ...(salvo.agenda || {}) },
  };
  lidoEm = Date.now();
  return cache;
}

export async function salvarConfiguracao(chave, valor) {
  await executar(
    'INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
    [chave, JSON.stringify(valor)],
  );
  cache = null;
}

export function limparCacheConfiguracoes() {
  cache = null;
}

/** Endereço em uma linha, para e-mail e calendário. */
export function enderecoCompleto(negocio) {
  const partes = [negocio.endereco, negocio.bairro, `${negocio.cidade} - ${negocio.uf}`].filter(Boolean);
  return partes.join(', ');
}
