// Cliente da API: cookies da mesma origem, token CSRF automático e erros em português.
let csrf = null;
let sessaoAtual = null;

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.erro || 'Algo deu errado. Tente de novo.');
    this.status = status;
    this.codigo = corpo?.codigo;
    this.campos = corpo?.campos || {};
  }
}

export async function carregarSessao(forcar = false) {
  if (!sessaoAtual || forcar) {
    sessaoAtual = fetch('/api/sessao', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { csrf = d.csrf; return d; })
      .catch(() => ({ usuario: null, offline: true }));
  }
  return sessaoAtual;
}

export async function api(caminho, { metodo = 'GET', corpo, repetir = true } = {}) {
  if (metodo !== 'GET' && !csrf) await carregarSessao(true);
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(metodo !== 'GET' ? { 'x-csrf-token': csrf || '' } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, { erro: 'Sem conexão. Confira a internet e tente de novo.', codigo: 'offline' });
  }
  let dados = null;
  try { dados = await resposta.json(); } catch { /* resposta sem corpo */ }
  if (dados?.csrf) csrf = dados.csrf;
  // Token CSRF velho (aba aberta há muito tempo): busca um novo e tenta uma vez
  if (resposta.status === 403 && dados?.codigo === 'proibido' && repetir && metodo !== 'GET') {
    await carregarSessao(true);
    return api(caminho, { metodo, corpo, repetir: false });
  }
  if (!resposta.ok) throw new ErroApi(resposta.status, dados);
  return dados;
}

export const get = (c) => api(c);
export const post = (c, corpo = {}) => api(c, { metodo: 'POST', corpo });
export const patch = (c, corpo = {}) => api(c, { metodo: 'PATCH', corpo });
export const put = (c, corpo = {}) => api(c, { metodo: 'PUT', corpo });
export const del = (c, corpo = {}) => api(c, { metodo: 'DELETE', corpo });

export function invalidarSessao() {
  sessaoAtual = null;
}
