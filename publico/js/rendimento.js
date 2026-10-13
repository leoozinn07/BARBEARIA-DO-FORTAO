// Painel > Rendimento: quanto entrou (concluído), quanto ainda vai entrar (confirmado) e o que se perdeu com faltas.
// Gráfico em SVG feito à mão: colunas empilhadas por dia (ou mês), dourado = recebido, cinza = a receber.
import { get } from './api.js';
import { h, hojeISO, icone, reais } from './ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ALTURA_PLOT = 200;
const FAIXA_X = 26;
const ESQ = 58; // espaço dos rótulos do eixo y

const s = (tag, atributos = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
};
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const pad = (n) => String(n).padStart(2, '0');

/** Valor curto para eixo e rótulo: R$ 450, R$ 1,2 mil */
function reaisCurto(centavos) {
  const r = centavos / 100;
  if (r >= 1000) return `R$ ${(r / 1000).toLocaleString('pt-BR', { maximumFractionDigits: r >= 10000 ? 0 : 1 })} mil`;
  return `R$ ${Math.round(r).toLocaleString('pt-BR')}`;
}

/** "1 a 13 de set." ou "15 de set. a 2 de out." */
function intervaloCurto(de, ate) {
  const [, m1, d1] = de.split('-').map(Number);
  const [, m2, d2] = ate.split('-').map(Number);
  if (de === ate) return `${d1} de ${MESES[m1 - 1]}.`;
  return m1 === m2 ? `${d1} a ${d2} de ${MESES[m1 - 1]}.` : `${d1} de ${MESES[m1 - 1]}. a ${d2} de ${MESES[m2 - 1]}.`;
}

function nomePeriodo(p, porMes, longo = false) {
  const [a, m, d] = p.split('-').map(Number);
  if (porMes) return longo ? `${MESES[m - 1]} de ${a}` : MESES[m - 1];
  if (!longo) return String(d);
  const data = new Date(Date.UTC(a, m - 1, d, 12));
  return data.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
}

/** Passo "redondo" para ~4 linhas de grade */
function passoBonito(maximo) {
  const bruto = maximo / 4;
  const base = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= bruto) return m * base;
  return 10 * base;
}

function presets() {
  const hoje = hojeISO();
  const [a, m] = hoje.split('-').map(Number);
  const mesPassado = m === 1 ? [a - 1, 12] : [a, m - 1];
  return {
    mes: [`${a}-${pad(m)}-01`, `${a}-${pad(m)}-${ultimoDiaDoMes(a, m)}`],
    'mes-passado': [`${mesPassado[0]}-${pad(mesPassado[1])}-01`, `${mesPassado[0]}-${pad(mesPassado[1])}-${ultimoDiaDoMes(...mesPassado)}`],
    7: [somarDias(hoje, -6), hoje],
    30: [somarDias(hoje, -29), hoje],
    ano: [`${a}-01-01`, `${a}-12-31`],
  };
}

export function montarRendimento(raiz) {
  const $ = (q) => raiz.querySelector(q);
  const grafico = $('[data-rend-grafico]');
  const dica = $('[data-rend-dica]');
  let dados = null;
  let ativo = -1;

  // ------------------------------------------------------------ filtros
  const botoes = [...raiz.querySelectorAll('[data-preset]')];
  const de = $('[data-rend-de]');
  const ate = $('[data-rend-ate]');
  function escolherPreset(nome) {
    const [x, y] = presets()[nome];
    de.value = x;
    ate.value = y;
    botoes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === nome)));
    carregar();
  }
  botoes.forEach((b) => b.addEventListener('click', () => escolherPreset(b.dataset.preset)));
  for (const campo of [de, ate]) {
    campo.addEventListener('change', () => {
      if (!de.value || !ate.value) return;
      botoes.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      carregar();
    });
  }

  // ------------------------------------------------------------ dados
  async function carregar() {
    raiz.dataset.carregando = 'true';
    try {
      dados = await get(`/admin/rendimento?de=${de.value}&ate=${ate.value}`);
      $('[data-rend-erro]').hidden = true;
      desenharNumeros();
      desenharGrafico();
      desenharServicos();
      desenharTabela();
    } catch (e) {
      const erro = $('[data-rend-erro]');
      erro.textContent = e.message;
      erro.hidden = false;
    } finally {
      raiz.dataset.carregando = 'false';
    }
  }

  // ------------------------------------------------------------ números do período
  function desenharNumeros() {
    const t = dados.totais;
    const antes = dados.anterior.realizado_centavos;
    const trecho = intervaloCurto(dados.anterior.de, dados.anterior.ate);
    let variacao = h('span', { class: 'kpi__delta' }, `Nada recebido de ${trecho} para comparar`);
    if (antes > 0) {
      const pct = Math.round(((t.realizado_centavos - antes) / antes) * 100);
      const sobe = pct >= 0;
      variacao = h('span', { class: `kpi__delta kpi__delta--${sobe ? 'sobe' : 'desce'}` },
        icone(sobe ? 'trend-up' : 'trend-down', 'ph-bold'), `${sobe ? '+' : ''}${pct}% `, h('span', {}, `vs. ${reais(antes)} de ${trecho}`));
    }
    $('[data-rend-kpis]').replaceChildren(
      h('div', { class: 'kpi kpi--heroi' },
        h('small', {}, h('i', { class: 'chave chave--real', 'aria-hidden': 'true' }), 'Recebido'),
        h('b', {}, reais(t.realizado_centavos)),
        variacao),
      h('div', { class: 'kpi' }, h('small', {}, h('i', { class: 'chave chave--receber', 'aria-hidden': 'true' }), 'A receber'), h('b', {}, reais(t.a_receber_centavos)),
        h('span', {}, `${t.agendados} horário${t.agendados === 1 ? '' : 's'} marcado${t.agendados === 1 ? '' : 's'}`)),
      h('div', { class: 'kpi' }, h('small', {}, 'Atendimentos'), h('b', {}, String(t.atendimentos)),
        h('span', {}, t.atendimentos ? `ticket médio ${reais(t.ticket_medio_centavos)}` : 'nenhum concluído ainda')),
      h('div', { class: 'kpi' }, h('small', {}, 'Faltas'), h('b', {}, String(t.faltas)),
        h('span', {}, t.faltas ? `${reais(t.faltas_centavos)} que não entraram` : `${t.cancelados} cancelado${t.cancelados === 1 ? '' : 's'}`)),
    );
  }

  // ------------------------------------------------------------ gráfico
  function desenharGrafico() {
    const serie = dados.serie;
    const porMes = dados.agrupado_por === 'mes';
    $('[data-rend-titulo-grafico]').textContent = porMes ? 'Por mês' : 'Por dia';
    const largura = Math.max(280, grafico.clientWidth);
    const plotW = largura - ESQ - 4;
    const total = (p) => p.realizado_centavos + p.a_receber_centavos;
    const maior = Math.max(...serie.map(total), 0);
    const passo = passoBonito(Math.max(maior * 1.12, 10000));
    const topo = Math.ceil((maior * 1.12 || 1) / passo) * passo || passo * 4;
    const y = (v) => ALTURA_PLOT - (v / topo) * ALTURA_PLOT;
    const faixa = plotW / serie.length;
    const barra = Math.max(3, Math.min(24, faixa - 2));

    const svg = s('svg', { viewBox: `0 0 ${largura} ${ALTURA_PLOT + FAIXA_X + 18}`, width: largura, height: ALTURA_PLOT + FAIXA_X + 18, class: 'graf', role: 'img',
      'aria-label': `Recebido e a receber ${porMes ? 'por mês' : 'por dia'}, de ${dados.de} a ${dados.ate}. A tabela abaixo tem os valores.` });
    const corpo = s('g', { transform: 'translate(0 18)' });
    svg.append(corpo);

    // Grade e eixo y: linhas finas, sólidas, discretas
    for (let v = 0; v <= topo + 1; v += passo) {
      corpo.append(s('line', { x1: ESQ, x2: largura, y1: y(v), y2: y(v), class: v === 0 ? 'graf__base' : 'graf__grade' }));
      const rotulo = s('text', { x: ESQ - 8, y: y(v) + 4, class: 'graf__eixo', 'text-anchor': 'end' });
      rotulo.textContent = reaisCurto(v);
      corpo.append(rotulo);
    }

    // Rótulos do eixo x: espaçados para não encostar
    const cada = porMes ? 1 : Math.ceil(serie.length / Math.max(1, Math.floor(plotW / 34)));
    const hoje = hojeISO();
    const iHoje = porMes ? -1 : serie.findIndex((p) => p.periodo === hoje);
    serie.forEach((p, i) => {
      const cx = ESQ + faixa * i + faixa / 2;
      // Hoje sempre aparece; os vizinhos dele saem para os números não encostarem
      const pertoDeHoje = iHoje >= 0 && i !== iHoje && Math.abs(i - iHoje) < Math.max(2, cada / 2 + 1);
      if ((i % cada === 0 && !pertoDeHoje) || i === iHoje) {
        const t = s('text', { x: cx, y: ALTURA_PLOT + 18, class: `graf__eixo${p.periodo === hoje ? ' graf__eixo--hoje' : ''}`, 'text-anchor': 'middle' });
        t.textContent = nomePeriodo(p.periodo, porMes);
        corpo.append(t);
      }
    });

    // Colunas: recebido embaixo, a receber em cima, 2px de respiro entre os dois; ponta de cima arredondada
    const coluna = (x, yTopo, yBase, arredondar, classe) => {
      const altura = yBase - yTopo;
      if (altura <= 0) return null;
      const r = arredondar ? Math.min(4, altura, barra / 2) : 0;
      const d = `M ${x} ${yBase} L ${x} ${yTopo + r} Q ${x} ${yTopo} ${x + r} ${yTopo} L ${x + barra - r} ${yTopo} Q ${x + barra} ${yTopo} ${x + barra} ${yTopo + r} L ${x + barra} ${yBase} Z`;
      return s('path', { d, class: classe });
    };
    const colunas = [];
    serie.forEach((p, i) => {
      const x = ESQ + faixa * i + (faixa - barra) / 2;
      const g = s('g', { class: 'graf__coluna' });
      const yReal = y(p.realizado_centavos);
      const temReceber = p.a_receber_centavos > 0;
      const pecaReal = coluna(x, yReal, ALTURA_PLOT, !temReceber, 'graf__real');
      if (pecaReal) g.append(pecaReal);
      if (temReceber) {
        const base = p.realizado_centavos > 0 ? yReal - 2 : ALTURA_PLOT;
        const pecaReceber = coluna(x, y(total(p)) - (p.realizado_centavos > 0 ? 2 : 0), base, true, 'graf__receber');
        if (pecaReceber) g.append(pecaReceber);
      }
      // Área de toque: a faixa inteira, bem maior que a coluna
      const alvo = s('rect', { x: ESQ + faixa * i, y: 0, width: faixa, height: ALTURA_PLOT, class: 'graf__alvo' });
      alvo.addEventListener('pointerenter', () => marcar(i));
      g.append(alvo);
      corpo.append(g);
      colunas.push(g);
    });

    // Um rótulo só: o maior valor do período
    if (maior > 0) {
      const i = serie.findIndex((p) => total(p) === maior);
      const t = s('text', { x: ESQ + faixa * i + faixa / 2, y: y(maior) - 8, class: 'graf__destaque', 'text-anchor': 'middle' });
      t.textContent = reaisCurto(maior);
      corpo.append(t);
    }

    svg.addEventListener('pointerleave', () => marcar(-1));
    grafico.replaceChildren(svg);
    grafico.colunas = colunas;
    grafico.faixa = faixa;
    $('[data-rend-vazio]').hidden = maior > 0;
    ativo = -1;
    dica.hidden = true;
  }

  function marcar(i) {
    const colunas = grafico.colunas || [];
    ativo = i;
    colunas.forEach((c, j) => c.classList.toggle('graf__coluna--apagada', i >= 0 && j !== i));
    if (i < 0) { dica.hidden = true; return; }
    const p = dados.serie[i];
    const porMes = dados.agrupado_por === 'mes';
    dica.replaceChildren(
      h('b', { class: 'dica__titulo' }, nomePeriodo(p.periodo, porMes, true)),
      h('span', { class: 'dica__linha' }, h('i', { class: 'chave chave--real', 'aria-hidden': 'true' }), h('b', {}, reais(p.realizado_centavos)), ' recebido'),
      h('span', { class: 'dica__linha' }, h('i', { class: 'chave chave--receber', 'aria-hidden': 'true' }), h('b', {}, reais(p.a_receber_centavos)), ' a receber'),
      h('span', { class: 'dica__linha dica__linha--sec' }, [
        p.atendimentos ? `${p.atendimentos} concluído${p.atendimentos === 1 ? '' : 's'}` : '',
        p.agendados ? `${p.agendados} marcado${p.agendados === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' · ') || 'Sem horários'),
    );
    dica.hidden = false;
    // Posiciona a dica sobre a coluna, sem sair da caixa do gráfico
    const centro = ESQ + grafico.faixa * i + grafico.faixa / 2;
    const largura = dica.offsetWidth;
    const max = grafico.clientWidth - largura;
    dica.style.transform = `translateX(${Math.max(0, Math.min(max, centro - largura / 2))}px)`;
  }

  // Teclado: o gráfico recebe foco e as setas andam pelas colunas
  grafico.addEventListener('keydown', (e) => {
    if (!dados) return;
    const n = dados.serie.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      marcar(Math.max(0, Math.min(n - 1, (ativo < 0 ? n - 1 : ativo) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') marcar(-1);
  });
  grafico.addEventListener('focus', () => {
    if (!dados || ativo >= 0) return;
    const hoje = dados.serie.findIndex((p) => p.periodo >= hojeISO().slice(0, dados.agrupado_por === 'mes' ? 7 : 10));
    marcar(hoje >= 0 ? hoje : dados.serie.length - 1);
  });
  grafico.addEventListener('blur', () => marcar(-1));

  // ------------------------------------------------------------ por serviço
  function desenharServicos() {
    const lista = dados.por_servico;
    const maior = Math.max(...lista.map((x) => x.realizado_centavos + x.a_receber_centavos), 1);
    $('[data-rend-servicos]').replaceChildren(...(lista.length ? lista.map((x) => {
      // Recebido e a receber lado a lado, com 2px de respiro; a ponta arredondada fica só no fim da barra
      const barra = h('div', { class: 'rend-servico__barra' });
      if (x.realizado_centavos > 0) {
        const real = h('span', { class: `rend-servico__real${x.a_receber_centavos > 0 ? ' rend-servico__real--meio' : ''}` });
        real.style.width = `${(x.realizado_centavos / maior) * 100}%`;
        barra.append(real);
      }
      if (x.a_receber_centavos > 0) {
        const receber = h('span', { class: 'rend-servico__receber' });
        receber.style.width = `${(x.a_receber_centavos / maior) * 100}%`;
        barra.append(receber);
      }
      return h('li', { class: 'rend-servico' },
        h('div', { class: 'rend-servico__topo' },
          h('b', {}, x.servico),
          h('span', {}, h('b', {}, reais(x.realizado_centavos)), x.a_receber_centavos ? ` + ${reais(x.a_receber_centavos)}` : '')),
        barra,
        h('small', {}, `${x.atendimentos} atendimento${x.atendimentos === 1 ? '' : 's'}${x.agendados ? `, ${x.agendados} marcado${x.agendados === 1 ? '' : 's'}` : ''}`),
      );
    }) : [h('li', { class: 'subtitulo' }, 'Nenhum serviço marcado neste período.')]));
  }

  // ------------------------------------------------------------ tabela (os mesmos números, sem depender do gráfico)
  function desenharTabela() {
    const porMes = dados.agrupado_por === 'mes';
    const linhas = dados.serie.filter((p) => p.realizado_centavos || p.a_receber_centavos || p.atendimentos || p.agendados);
    $('[data-rend-tabela]').replaceChildren(...(linhas.length ? linhas.map((p) => h('tr', {},
      h('th', { scope: 'row' }, nomePeriodo(p.periodo, porMes, true)),
      h('td', {}, reais(p.realizado_centavos)),
      h('td', {}, reais(p.a_receber_centavos)),
      h('td', {}, String(p.atendimentos + p.agendados)),
    )) : [h('tr', {}, h('td', { colspan: 4 }, 'Sem movimento no período.'))]));
  }

  // Redesenha ao mudar a largura (girar o celular, abrir o painel no computador)
  let largura = 0;
  new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width);
    if (dados && w !== largura) { largura = w; desenharGrafico(); }
  }).observe(grafico);

  escolherPreset('mes');
}
