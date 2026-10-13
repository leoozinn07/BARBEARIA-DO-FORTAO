// Componente "Marque em 3 toques": serviço, dia e horário com dados reais da API.
// Usado na página inicial, em /agendar e na remarcação (modo remarcar: serviço fixo).
import { get } from './api.js';
import { h, quando, reais } from './ui.js';

const CHAVE = 'fortao:escolha';
const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function lerEscolhaGuardada() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); } catch { return null; }
}
export function guardarEscolha(escolha) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(escolha)); } catch { /* sem armazenamento */ }
}
export function esquecerEscolha() {
  try { sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}

function periodo(horaTexto) {
  const hh = Number(horaTexto.slice(0, 2));
  return hh < 12 ? 'Manhã' : hh < 18 ? 'Tarde' : 'Noite';
}

/**
 * @param {HTMLElement} raiz
 * @param {{ aoConfirmar: Function, servicoFixo?: object, rotulo?: string, inicial?: object, legendaId?: string }} opcoes
 */
export function montarAgendamento(raiz, opcoes) {
  const estado = { servicos: [], servico: null, dias: [], dia: null, horarios: [], inicio: null, carregando: false };
  const inicial = opcoes.inicial || lerEscolhaGuardada() || {};

  const caixaServicos = h('div', { class: 'ag-servicos' });
  const caixaDias = h('div', { class: 'ag-dias' });
  const caixaHoras = h('div', { class: 'ag-horas', 'aria-live': 'polite' });
  const resumo = h('p', { class: 'ag-resumo__texto', 'aria-live': 'polite' }, 'Escolha um horário');
  const botao = h('button', { class: 'botao botao--cheio botao--bloco botao--g', type: 'submit', disabled: true }, opcoes.rotulo || 'Marcar horário');
  const erro = h('p', { class: 'alerta alerta--erro', role: 'alert', hidden: true });

  const form = h('form', { class: 'ag', novalidate: true },
    opcoes.servicoFixo ? null : h('fieldset', { class: 'ag-grupo' }, h('legend', { class: 'rotulo' }, 'Serviço'), caixaServicos),
    h('fieldset', { class: 'ag-grupo' }, h('legend', { class: 'rotulo' }, 'Dia'), caixaDias),
    h('fieldset', { class: 'ag-grupo' }, h('legend', { class: 'rotulo' }, 'Horário'), caixaHoras),
    erro,
    h('div', { class: 'ag-resumo' }, resumo, botao),
  );
  raiz.replaceChildren(form);

  const esqueleto = (n, classe) => Array.from({ length: n }, () => h('div', { class: `esqueleto ${classe}` }));

  function atualizarResumo() {
    const pronto = estado.servico && estado.inicio;
    botao.disabled = !pronto || estado.carregando;
    resumo.classList.add('trocando');
    setTimeout(() => {
      if (pronto) {
        resumo.replaceChildren(h('b', {}, estado.servico.nome), `, ${quando(estado.inicio)}, `, h('b', {}, reais(estado.servico.preco_centavos)));
      } else {
        resumo.textContent = estado.dia ? 'Agora escolha o horário' : 'Escolha um horário';
      }
      resumo.classList.remove('trocando');
    }, 110);
    if (pronto) guardarEscolha({ servico: estado.servico.slug, dia: estado.dia, inicio: estado.inicio });
  }

  function desenharServicos() {
    caixaServicos.replaceChildren(...estado.servicos.map((s) => h('label', { class: 'ag-servico' },
      h('input', { type: 'radio', name: 'servico', value: s.slug, checked: s.slug === estado.servico?.slug, onchange: () => escolherServico(s.slug) }),
      h('span', { class: 'ag-servico__nome' }, s.nome),
      h('span', { class: 'ag-servico__info' }, h('b', {}, reais(s.preco_centavos)), h('small', {}, `${s.duracao_min} min`)),
    )));
  }

  function desenharDias() {
    if (!estado.dias.length) { caixaDias.replaceChildren(h('p', { class: 'subtitulo' }, 'Agenda indisponível no momento.')); return; }
    caixaDias.replaceChildren(...estado.dias.map((d, i) => {
      const [, m, dd] = d.data.split('-');
      const fechado = !d.aberto;
      const lotado = d.aberto && d.livres === 0;
      const nome = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : NOMES_DIA[d.dia_semana];
      return h('label', { class: 'ag-dia', title: fechado ? 'Fechado' : lotado ? 'Sem horário livre' : `${d.livres} horários livres` },
        h('input', { type: 'radio', name: 'dia', value: d.data, checked: d.data === estado.dia, disabled: fechado || lotado, onchange: () => escolherDia(d.data) }),
        h('small', {}, nome),
        h('b', {}, String(Number(dd))),
        h('span', { class: 'ag-dia__info' }, fechado ? 'fechado' : lotado ? 'lotado' : `${d.livres} livres`),
        h('span', { class: 'sr-only' }, ` ${dd}/${m}`),
      );
    }));
    // Centraliza o dia escolhido só na faixa horizontal (scrollIntoView também rolaria a página)
    const escolhido = caixaDias.querySelector('input:checked')?.closest('label');
    if (escolhido) {
      const desvio = escolhido.getBoundingClientRect().left - caixaDias.getBoundingClientRect().left;
      caixaDias.scrollLeft += desvio - (caixaDias.clientWidth - escolhido.offsetWidth) / 2;
    }
  }

  function desenharHoras() {
    if (!estado.dia) { caixaHoras.replaceChildren(h('p', { class: 'subtitulo' }, 'Escolha um dia primeiro.')); return; }
    if (!estado.horarios.length) {
      caixaHoras.replaceChildren(h('div', { class: 'vazio' }, h('b', {}, 'Esse dia lotou'), h('span', {}, 'Tenta outro dia ou outro serviço.')));
      return;
    }
    const grupos = new Map();
    for (const x of estado.horarios) {
      const p = periodo(x.hora);
      if (!grupos.has(p)) grupos.set(p, []);
      grupos.get(p).push(x);
    }
    caixaHoras.replaceChildren(...[...grupos].map(([nome, lista]) => h('div', { class: 'ag-periodo' },
      h('p', { class: 'ag-periodo__nome' }, nome),
      h('div', { class: 'ag-periodo__lista' }, ...lista.map((x) => h('label', { class: 'ag-hora' },
        h('input', { type: 'radio', name: 'inicio', value: x.inicio, checked: x.inicio === estado.inicio, onchange: () => { estado.inicio = x.inicio; erro.hidden = true; atualizarResumo(); } }),
        x.hora,
      ))),
    )));
  }

  async function escolherServico(slug) {
    estado.servico = estado.servicos.find((s) => s.slug === slug) || estado.servicos[0];
    estado.inicio = null;
    caixaDias.replaceChildren(...esqueleto(6, 'ag-dia-esq'));
    caixaHoras.replaceChildren(...esqueleto(8, 'ag-hora-esq'));
    atualizarResumo();
    try {
      const { dias } = await get(`/dias?servico=${encodeURIComponent(estado.servico.slug)}`);
      estado.dias = dias;
      const manter = dias.find((d) => d.data === estado.dia && d.livres > 0);
      estado.dia = (manter || dias.find((d) => d.livres > 0))?.data ?? null;
      desenharDias();
      await escolherDia(estado.dia, { manterInicio: inicial.inicio });
    } catch (e) {
      caixaDias.replaceChildren(h('p', { class: 'alerta alerta--erro' }, e.message));
    }
  }

  async function escolherDia(data, { manterInicio } = {}) {
    estado.dia = data;
    estado.inicio = null;
    atualizarResumo();
    if (!data) { desenharHoras(); return; }
    caixaHoras.replaceChildren(...esqueleto(8, 'ag-hora-esq'));
    try {
      const { horarios } = await get(`/horarios?servico=${encodeURIComponent(estado.servico.slug)}&data=${data}`);
      estado.horarios = horarios;
      if (manterInicio && horarios.some((x) => x.inicio === manterInicio)) estado.inicio = manterInicio;
      desenharHoras();
      atualizarResumo();
    } catch (e) {
      caixaHoras.replaceChildren(h('p', { class: 'alerta alerta--erro' }, e.message));
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!estado.servico || !estado.inicio) return;
    erro.hidden = true;
    estado.carregando = true;
    botao.setAttribute('aria-busy', 'true');
    botao.disabled = true;
    try {
      await opcoes.aoConfirmar({ servico: estado.servico, inicio: estado.inicio });
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
      // Horário tomado por outra pessoa no meio do caminho: atualiza a grade
      if (e.codigo === 'horario_ocupado') await escolherDia(estado.dia);
    } finally {
      estado.carregando = false;
      botao.removeAttribute('aria-busy');
      atualizarResumo();
    }
  });

  (async () => {
    if (opcoes.servicoFixo) {
      estado.servicos = [opcoes.servicoFixo];
      await escolherServico(opcoes.servicoFixo.slug);
      return;
    }
    caixaServicos.replaceChildren(...esqueleto(3, 'ag-servico-esq'));
    try {
      const { servicos } = await get('/servicos');
      estado.servicos = servicos;
      estado.servico = servicos.find((s) => s.slug === inicial.servico) || servicos[0];
      estado.dia = inicial.dia || null;
      desenharServicos();
      await escolherServico(estado.servico.slug);
    } catch (e) {
      caixaServicos.replaceChildren(h('p', { class: 'alerta alerta--erro' }, e.message));
    }
  })();

  return { recarregar: () => escolherDia(estado.dia), estado };
}

