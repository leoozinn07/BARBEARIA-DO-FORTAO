// "Casca" comum a todas as páginas: cabeçalho, avisos, abas e rodapé.
import { carregarSessao, get, patch, post } from './api.js';
import { h, icone, primeiroNome, relativo, revelar } from './ui.js';
import './ouro.js';

const $ = (s, r = document) => r.querySelector(s);
let configPublica = null;

export async function obterConfig() {
  configPublica ||= get('/config').catch(() => null);
  return configPublica;
}

function marcarNavegacao(usuario) {
  const caminho = location.pathname.replace(/\.html$/, '');
  const hash = location.hash;
  const atual = caminho === '/' ? 'inicio' : caminho === '/agendar' ? 'agendar' : caminho === '/conta' ? (hash === '#perfil' ? 'conta' : 'horarios') : caminho === '/admin' ? 'horarios' : '';
  document.querySelectorAll('[data-aba]').forEach((a) => {
    if (a.dataset.aba === atual) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // Para o Fortão, a aba "Horários" vira o painel
  if (usuario?.papel === 'admin') {
    const aba = $('[data-aba="horarios"]');
    if (aba) {
      aba.href = '/admin';
      aba.replaceChildren(icone('squares-four'), h('span', {}, 'Painel'));
    }
    document.querySelectorAll('[data-so-admin]').forEach((e) => { e.hidden = false; });
  }
}

function aplicarPreferencias(usuario) {
  const prefs = usuario?.preferencias;
  if (!prefs) return;
  const raiz = document.documentElement;
  raiz.dataset.tema = prefs.tema || 'escuro';
  if (prefs.letra_grande) raiz.dataset.letra = 'grande'; else delete raiz.dataset.letra;
  try {
    localStorage.setItem('fortao:tema', prefs.tema || 'escuro');
    localStorage.setItem('fortao:letra', prefs.letra_grande ? 'grande' : 'normal');
  } catch { /* sem armazenamento */ }
}

// ---------------------------------------------------------------- tema claro / escuro
const COR_TOPO = { escuro: '#0b0b0c', claro: '#efeff0' };

/** Tema que está na tela agora ("auto" segue o celular). */
export function temaAtual() {
  const t = document.documentElement.dataset.tema;
  if (t === 'auto') return matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro';
  return t === 'claro' ? 'claro' : 'escuro';
}

/** Troca o tema, guarda no aparelho e, com conta, no perfil (vale nos outros aparelhos). */
export function definirTema(tema, usuario) {
  const aplicar = () => {
    document.documentElement.dataset.tema = tema;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_TOPO[temaAtual()]);
    document.dispatchEvent(new CustomEvent('tema-mudou', { detail: tema }));
  };
  // Troca com um esmaecer curto quando o navegador sabe fazer e a pessoa não pediu menos movimento
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(aplicar);
  else aplicar();
  try { localStorage.setItem('fortao:tema', tema); } catch { /* sem armazenamento */ }
  if (usuario) {
    usuario.preferencias = { ...usuario.preferencias, tema };
    patch('/conta', { preferencias: { tema } }).catch(() => {});
  }
}

function ligarTema(usuario) {
  const botao = $('[data-tema-botao]');
  if (!botao) return;
  const desenhar = () => {
    const claro = temaAtual() === 'claro';
    botao.querySelector('i').className = `ph ph-${claro ? 'moon' : 'sun'}`;
    botao.setAttribute('aria-label', claro ? 'Mudar para o tema escuro' : 'Mudar para o tema claro');
    botao.title = claro ? 'Tema escuro' : 'Tema claro';
  };
  botao.addEventListener('click', () => definirTema(temaAtual() === 'claro' ? 'escuro' : 'claro', usuario));
  document.addEventListener('tema-mudou', desenhar);
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', desenhar);
  desenhar();
}

// ---------------------------------------------------------------- avisos
async function abrirAvisos(painel, botao) {
  painel.hidden = false;
  botao.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => requestAnimationFrame(() => { painel.dataset.aberto = 'true'; }));
  const lista = $('[data-avisos-lista]', painel);
  lista.replaceChildren(h('div', { class: 'folha__corpo' }, h('div', { class: 'esqueleto esqueleto--aviso' }), h('div', { class: 'esqueleto esqueleto--aviso' })));
  try {
    const { notificacoes } = await get('/notificacoes');
    if (!notificacoes.length) {
      lista.replaceChildren(h('div', { class: 'folha__corpo' }, h('div', { class: 'vazio' }, icone('bell-simple'), h('b', {}, 'Nada por aqui'), h('span', {}, 'Confirmações e lembretes dos seus horários aparecem aqui.'))));
    } else {
      lista.replaceChildren(...notificacoes.map((n) => h(n.link ? 'a' : 'div', { class: 'aviso-item', href: n.link || null, 'data-lida': String(n.lida) },
        h('div', {}, h('b', {}, n.titulo), h('p', {}, n.corpo), h('time', { datetime: n.criado_em }, relativo(n.criado_em))))));
      if (notificacoes.some((n) => !n.lida)) {
        await post('/notificacoes/lidas', {});
        const c = $('[data-contador]');
        if (c) c.hidden = true;
      }
    }
  } catch (e) {
    lista.replaceChildren(h('div', { class: 'folha__corpo' }, h('p', { class: 'alerta alerta--erro' }, e.message)));
  }
}

function fecharAvisos(painel, botao) {
  painel.dataset.aberto = 'false';
  botao.setAttribute('aria-expanded', 'false');
  setTimeout(() => { if (painel.dataset.aberto === 'false') painel.hidden = true; }, 220);
}

function ligarAvisos(usuario, naoLidas) {
  const botao = $('[data-avisos-botao]');
  const painel = $('[data-avisos-painel]');
  if (!botao || !painel || !usuario) return;
  botao.hidden = false;
  const contador = $('[data-contador]');
  if (naoLidas > 0) {
    contador.textContent = naoLidas > 9 ? '9+' : String(naoLidas);
    contador.hidden = false;
    botao.setAttribute('aria-label', `Avisos, ${naoLidas} novo${naoLidas > 1 ? 's' : ''}`);
  }
  botao.addEventListener('click', () => (painel.dataset.aberto === 'true' ? fecharAvisos(painel, botao) : abrirAvisos(painel, botao)));
  $('[data-avisos-fechar]', painel).addEventListener('click', () => { fecharAvisos(painel, botao); botao.focus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && painel.dataset.aberto === 'true') { fecharAvisos(painel, botao); botao.focus(); } });
  document.addEventListener('click', (e) => {
    if (painel.dataset.aberto === 'true' && !painel.contains(e.target) && !botao.contains(e.target)) fecharAvisos(painel, botao);
  });
}

// ---------------------------------------------------------------- rodapé
async function preencherRodape() {
  document.querySelectorAll('[data-ano]').forEach((e) => { e.textContent = new Date().getFullYear(); });
  const cfg = await obterConfig();
  const social = $('[data-social]');
  if (!cfg || !social) return;
  const links = [];
  if (cfg.negocio.instagram) links.push(h('a', { class: 'icone-botao', href: `https://instagram.com/${encodeURIComponent(cfg.negocio.instagram)}`, target: '_blank', rel: 'noopener', 'aria-label': 'Instagram da barbearia' }, icone('instagram-logo')));
  if (cfg.negocio.whatsapp) links.push(h('a', { class: 'icone-botao', href: `https://wa.me/${cfg.negocio.whatsapp.startsWith('55') ? '' : '55'}${cfg.negocio.whatsapp}`, target: '_blank', rel: 'noopener', 'aria-label': 'WhatsApp da barbearia' }, icone('whatsapp-logo')));
  social.replaceChildren(...links);
}

// ---------------------------------------------------------------- inicialização
// ---------------------------------------------------------------- boas-vindas
// A tela de entrar ou de criar conta pede a animação; a página seguinte (conta, marcar...) mostra, já com o nome da sessão.
const CHAVE_SAUDACAO = 'fortao:saudacao';
const FRASES_SAUDACAO = { cadastro: 'Bem-vindo ao seu lar,', login: 'Fortaleça sua autoestima novamente,' };

export function pedirSaudacao(tipo) {
  try { sessionStorage.setItem(CHAVE_SAUDACAO, tipo); } catch { /* sem armazenamento: segue sem animação */ }
}

function mostrarSaudacao(usuario) {
  let tipo = null;
  try {
    tipo = sessionStorage.getItem(CHAVE_SAUDACAO);
    sessionStorage.removeItem(CHAVE_SAUDACAO);
  } catch { return; }
  // Só para clientes: o Fortão vai direto para o painel
  if (!FRASES_SAUDACAO[tipo] || usuario?.papel !== 'cliente') return;
  const palavras = FRASES_SAUDACAO[tipo].split(' ');
  const frase = h('p', { class: 'boas-vindas__frase' });
  palavras.forEach((p, i) => {
    const s = h('span', { class: 'boas-vindas__palavra' }, p);
    s.style.setProperty('--i', String(i));
    frase.append(s, i < palavras.length - 1 ? ' ' : '');
  });
  const conteudo = h('div', { class: 'boas-vindas__conteudo' },
    h('img', { class: 'boas-vindas__marca', src: '/img/braco.svg', alt: '', width: 64, height: 75 }),
    frase,
    ' ', // o leitor de tela lê "lar, Rafael" e não "lar,Rafael"
    h('strong', { class: 'boas-vindas__nome' }, primeiroNome(usuario.nome) || 'cliente'),
    h('span', { class: 'boas-vindas__linha', 'aria-hidden': 'true' }));
  conteudo.style.setProperty('--n', String(palavras.length));
  const camada = h('div', { class: `boas-vindas boas-vindas--${tipo}`, role: 'status', 'aria-live': 'polite', title: 'Toque para continuar' }, conteudo);
  const fechar = () => {
    if (camada.classList.contains('saindo')) return;
    camada.classList.add('saindo');
    document.removeEventListener('keydown', tecla);
    setTimeout(() => camada.remove(), 450);
  };
  const tecla = (e) => { if (e.key === 'Escape' || e.key === 'Enter') fechar(); };
  camada.addEventListener('click', fechar);
  document.addEventListener('keydown', tecla);
  document.body.append(camada);
  setTimeout(fechar, matchMedia('(prefers-reduced-motion: reduce)').matches ? 2200 : 3600);
}

export async function iniciarCasca() {
  const topo = $('[data-topo]');
  const sentinela = $('[data-sentinela]');
  if (topo && sentinela && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { topo.dataset.rolado = String(!en.isIntersecting); }).observe(sentinela);
  }

  const sessao = await carregarSessao();
  const usuario = sessao.usuario;
  aplicarPreferencias(usuario);
  mostrarSaudacao(usuario);
  marcarNavegacao(usuario);
  const link = $('[data-conta-link]');
  if (usuario && link) {
    link.href = usuario.papel === 'admin' ? '/admin' : '/conta#perfil';
    link.querySelector('i').className = 'ph ph-user-circle-check';
    $('[data-conta-rotulo]').textContent = usuario.papel === 'admin' ? 'Abrir painel' : 'Minha conta';
  }
  let naoLidas = 0;
  if (usuario) naoLidas = (await get('/notificacoes').catch(() => ({ nao_lidas: 0 }))).nao_lidas;
  ligarAvisos(usuario, naoLidas);
  ligarTema(usuario);
  preencherRodape();
  revelar();
  window.addEventListener('hashchange', () => marcarNavegacao(usuario));
  return { usuario, sessao };
}
