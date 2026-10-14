// Endereço da barbearia e links do Google Maps (oficiais, sem chave de API), a partir dos dados do painel.
export const ENDERECO_PADRAO = { endereco: 'Av. Tancredo de Almeida Neves, 1463', bairro: 'Cohab 5', cidade: 'Carapicuíba', uf: 'SP', mapa_link: '' };

const dados = (n) => ({ ...ENDERECO_PADRAO, ...(n?.endereco ? n : {}) });

/** "Av. Tancredo de Almeida Neves, 1463, Cohab 5, Carapicuíba - SP" */
export function enderecoTexto(n) {
  const d = dados(n);
  return [d.endereco, d.bairro, `${d.cidade} - ${d.uf}`].filter(Boolean).join(', ');
}

// A busca usa rua, número e cidade: o bairro às vezes confunde o mapa
const busca = (n) => {
  const d = dados(n);
  return encodeURIComponent([d.endereco, `${d.cidade} - ${d.uf}`].join(', '));
};

/** Abre a barbearia no Google Maps (o link colado no painel, se houver). */
export const linkMapa = (n) => dados(n).mapa_link || `https://www.google.com/maps/search/?api=1&query=${busca(n)}`;
/** Rota até a barbearia, saindo de onde o cliente está (abre o app do Maps no celular). */
export const linkRota = (n) => `https://www.google.com/maps/dir/?api=1&destination=${busca(n)}`;
/** Mapa para embutir na página (só carrega depois do toque do cliente). */
export const linkMapaEmbutido = (n) => `https://www.google.com/maps?q=${busca(n)}&output=embed`;
