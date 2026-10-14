// Configurações editáveis pelo painel (endereço, contatos, regras da agenda), com cache curto.
import { consulta } from '../db/index.js';
import { CONFIG_INICIAL } from '../db/semear.js';

let cache = null;
let lidoEm = 0;

export async function lerConfiguracoes() {
  if (cache && Date.now() - lidoEm < 30000) return cache;
  const linhas = await consulta('SELECT chave, valor FROM configuracoes');
  const salvo = Object.fromEntries(linhas.map((l) => [l.chave, typeof l.valor === 'string' ? JSON.parse(l.valor) : l.valor]));
  cache = {
    negocio: { ...CONFIG_INICIAL.negocio, ...(salvo.negocio || {}) },
    agenda: { ...CONFIG_INICIAL.agenda, ...(salvo.agenda || {}) },
  };
  lidoEm = Date.now();
  return cache;
}

export async function salvarConfiguracao(chave, valor) {
  await consulta(
    'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
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

// Google Maps (links oficiais, sem chave de API). A busca usa rua, número e cidade: o bairro às vezes confunde o mapa.
const buscaMapa = (n) => encodeURIComponent([n.endereco, n.cidade && `${n.cidade} - ${n.uf}`].filter(Boolean).join(', '));

/** Abre a barbearia no Google Maps: o link que o Fortão colou no painel ou a busca pelo endereço. */
export const linkMapa = (n) => n.mapa_link || `https://www.google.com/maps/search/?api=1&query=${buscaMapa(n)}`;

/** Rota até a barbearia, saindo de onde o cliente está. */
export const linkRota = (n) => `https://www.google.com/maps/dir/?api=1&destination=${buscaMapa(n)}`;
