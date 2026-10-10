// Utilidades de interface. Texto do usuário sempre via textContent (nada de innerHTML com dado de fora).
const FUSO = 'America/Sao_Paulo';

/** h('p', { class: 'x', onclick }, 'texto', filho) */
export function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    // Estilo via CSSOM: a CSP bloqueia o atributo style, mas não el.style
    else if (k === 'style') el.style.cssText = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export const icone = (nome, peso = 'ph') => h('i', { class: `${peso} ph-${nome}`, 'aria-hidden': 'true' });

// ---------------------------------------------------------------- formatos
export const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: centavos % 100 ? 2 : 0 });
const f = (op) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...op });
const fData = f({ weekday: 'long', day: 'numeric', month: 'long' });
const fCurta = f({ weekday: 'short', day: 'numeric', month: 'short' });
const fHora = f({ hour: '2-digit', minute: '2-digit' });
export const dataLonga = (iso) => fData.format(new Date(iso));
export const dataCurta = (iso) => fCurta.format(new Date(iso)).replace(/\./g, '');
export const hora = (iso) => fHora.format(new Date(iso));
export const quando = (iso) => `${dataLonga(iso)} às ${hora(iso)}`;
export function relativo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return dataCurta(iso);
}
/** Data local de hoje em São Paulo (YYYY-MM-DD) */
export const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
export const telefoneBonito = (t) => (t ? String(t).replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '');
export const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';

// ---------------------------------------------------------------- notificação (toast)
let timerToast;
export function toast({ titulo = 'Barbearia do Fortão', texto = '', erro = false, tempo = 4200 } = {}) {
  const el = document.querySelector('[data-toast]');
  if (!el) return;
  el.querySelector('[data-toast-titulo]').textContent = titulo;
  el.querySelector('[data-toast-texto]').textContent = texto;
  el.classList.toggle('toast--erro', erro);
  const caixaIcone = el.querySelector('[data-toast-icone]');
  caixaIcone.replaceChildren(erro ? icone('warning-circle', 'ph-bold') : h('img', { src: '/img/braco.svg', alt: '', width: 22, height: 26 }));
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { el.dataset.visivel = 'true'; }));
  clearTimeout(timerToast);
  const esconder = () => { el.dataset.visivel = 'false'; };
  timerToast = setTimeout(esconder, tempo);
  el.querySelector('[data-toast-fechar]').onclick = esconder;
}
export const toastErro = (e, titulo = 'Não deu certo') => toast({ titulo, texto: e?.message || String(e), erro: true, tempo: 6000 });

// ---------------------------------------------------------------- formulários
export function limparErros(form) {
  form.querySelectorAll('[aria-invalid="true"]').forEach((c) => c.removeAttribute('aria-invalid'));
  form.querySelectorAll('[data-erro-de]').forEach((e) => { e.textContent = ''; });
  const geral = form.querySelector('[data-erro-geral]');
  if (geral) { geral.textContent = ''; geral.hidden = true; }
}

/** Mostra os erros vindos da API ao lado de cada campo e foca o primeiro. */
export function mostrarErros(form, erro) {
  limparErros(form);
  let primeiro = null;
  for (const [campo, msg] of Object.entries(erro.campos || {})) {
    const input = form.elements.namedItem(campo);
    const alvo = form.querySelector(`[data-erro-de="${campo}"]`);
    if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); primeiro ||= input; }
    if (alvo) alvo.textContent = msg;
  }
  const geral = form.querySelector('[data-erro-geral]');
  if (geral && (!primeiro || !Object.keys(erro.campos || {}).length)) {
    geral.replaceChildren(icone('warning-circle', 'ph-bold'), h('span', {}, erro.message));
    geral.hidden = false;
  }
  (primeiro || geral)?.focus?.({ preventScroll: false });
}

export function ocupado(botao, sim = true) {
  if (!botao) return;
  botao.setAttribute('aria-busy', String(sim));
  botao.disabled = sim;
}

/** Botão de mostrar/ocultar senha */
export function ligarVerSenha(raiz = document) {
  raiz.querySelectorAll('[data-ver-senha]').forEach((b) => {
    b.addEventListener('click', () => {
      const input = b.parentElement.querySelector('input');
      const mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(mostrar));
      b.querySelector('i').className = `ph ph-${mostrar ? 'eye-slash' : 'eye'}`;
    });
  });
}

// ---------------------------------------------------------------- folhas (dialog)
export function abrirFolha(dialog) {
  if (!dialog.open) dialog.showModal();
  // Toque fora da folha fecha
  dialog.onclick = (e) => { if (e.target === dialog) dialog.close(); };
}

// ---------------------------------------------------------------- revelar ao rolar
export function revelar(raiz = document) {
  const itens = raiz.querySelectorAll('[data-revelar]:not(.visivel)');
  if (!('IntersectionObserver' in window)) { itens.forEach((i) => i.classList.add('visivel')); return; }
  const io = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('visivel'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
  itens.forEach((i) => io.observe(i));
}

/** Volta para a página pedida depois do login, só se for do próprio site. */
export function destinoSeguro(padrao = '/conta') {
  const v = new URLSearchParams(location.search).get('volta');
  // Só caminhos internos: '/x' sim; '//site.com' e '/\\site.com' (que o navegador trata como outro site) não
  return v && /^\/(?![/\\])/.test(v) ? v : padrao;
}
