// Toque dourado: ao apertar qualquer botão ou caixa, um contorno dourado aparece e some.
// Fica enquanto o dedo está em cima e por pelo menos 180 ms, para dar tempo de ver num toque rápido.

const ALVOS = [
  '.botao', '.icone-botao', '.aba', '.marca', '.hero__livre', '.onde__mapa-botao', '.topo__links a', '.rodape__links a', '.segmentos a',
  '.ag-servico', '.ag-adicional', '.ag-dia', '.ag-hora', '.opcoes-tema label', '.marcar', '.aviso-item', '[data-toque]',
  '.horario', '.item-agenda', '.lista-admin li', '.servico-admin', '.dia-semana', '.resumo__item', '.kpi', '.rend-servico',
  '.tabela__item', '.passo', '.frase', '.ag-resumo', '.cartao', '.grupo-form', '.onde', '.fortao',
].join(', ');
const CAMPO_DE_TEXTO = 'input:not([type="radio"]):not([type="checkbox"]), select, textarea';
const MINIMO_MS = 180;

let atual = null;
let inicio = 0;

/** A parte que se vê: na caixa de seleção, o quadradinho; no tema, o cartão; no resto, o próprio elemento. */
function parteVisivel(alvo) {
  if (alvo.matches('.marcar')) return alvo.querySelector('input') || alvo;
  if (alvo.matches('.opcoes-tema label')) return alvo.querySelector('span') || alvo;
  return alvo;
}

function desativado(alvo) {
  return alvo.disabled || alvo.getAttribute('aria-disabled') === 'true' || alvo.matches(':has(input:disabled)');
}

function soltar() {
  if (!atual) return;
  const el = atual;
  atual = null;
  const espera = Math.max(0, MINIMO_MS - (performance.now() - inicio));
  setTimeout(() => {
    el.classList.remove('toque-ouro');
    el.classList.add('toque-ouro--saindo');
    el.addEventListener('animationend', () => el.classList.remove('toque-ouro--saindo'), { once: true });
    // Sem animação (movimento reduzido), o evento pode não vir
    setTimeout(() => el.classList.remove('toque-ouro--saindo'), 600);
  }, espera);
}

document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest(CAMPO_DE_TEXTO)) return;
  const alvo = e.target.closest(ALVOS);
  if (!alvo || desativado(alvo)) return;
  soltar();
  atual = parteVisivel(alvo);
  inicio = performance.now();
  atual.classList.remove('toque-ouro--saindo');
  atual.classList.add('toque-ouro');
}, { passive: true });

for (const tipo of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(tipo, soltar, { passive: true });
// Rolagem com o dedo em cima de um cartão não deixa o contorno preso
document.addEventListener('scroll', soltar, { passive: true, capture: true });
