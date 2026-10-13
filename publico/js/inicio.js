// Página inicial: saudação, próximo horário livre, agendamento em 3 toques, tabela, frase do dia e endereço.
import { get, post } from './api.js';
import { iniciarCasca, obterConfig } from './casca.js';
import { esquecerEscolha, montarAgendamento } from './agendamento.js';
import { abrirFolha, dataCurta, h, primeiroNome, quando, reais } from './ui.js';

const $ = (s) => document.querySelector(s);
const FRASES = [
  'Constância vence talento.',
  'Cabelo na régua, mente no lugar.',
  'Disciplina é o meu superpoder.',
  'Corre pelo seu.',
  'Todo dia é dia de ficar na régua.',
  'O espelho mostra a disciplina.',
  'Quem é constante não depende de sorte.',
];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const { usuario } = await iniciarCasca();

// ---------------------------------------------------------------- saudação
const hh = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const cumprimento = hh < 12 ? 'Bom dia' : hh < 18 ? 'Boa tarde' : 'Boa noite';
$('[data-saudacao]').textContent = usuario ? `${cumprimento}, ${primeiroNome(usuario.nome)}` : cumprimento;

// ---------------------------------------------------------------- agendamento
const folhaSucesso = $('[data-folha-sucesso]');
const folhaEntrar = $('[data-folha-entrar]');
montarAgendamento($('[data-agendamento]'), {
  async aoConfirmar({ servico, inicio }) {
    if (!usuario) {
      $('[data-entrar-texto]').textContent = `${servico.nome}, ${quando(inicio)}. Entre ou crie a conta para confirmar: seu horário fica guardado.`;
      abrirFolha(folhaEntrar);
      return;
    }
    const { agendamento } = await post('/agendamentos', { servico: servico.slug, inicio });
    esquecerEscolha();
    $('[data-sucesso-texto]').textContent = `${agendamento.servico}, ${quando(agendamento.inicio)}. Valor: ${reais(agendamento.preco_centavos)}, pago na barbearia.`;
    abrirFolha(folhaSucesso);
    folhaSucesso.addEventListener('close', () => location.reload(), { once: true });
  },
});

// ---------------------------------------------------------------- próximo horário livre e tabela
get('/servicos').then(async ({ servicos }) => {
  $('[data-tabela]').replaceChildren(...servicos.map((s) => h('li', { class: 'tabela__item' },
    h('span', { class: 'tabela__nome' }, s.nome, h('span', { class: 'tabela__duracao' }, `${s.duracao_min} min`)),
    h('span', { class: 'tabela__preco' }, reais(s.preco_centavos)),
    h('span', { class: 'tabela__desc' }, s.descricao),
  )));
  const { dias } = await get(`/dias?servico=${servicos[0].slug}`);
  const dia = dias.find((d) => d.livres > 0);
  if (!dia) return;
  const chip = $('[data-proximo-livre]');
  const rotulo = dia.data === dias[0].data ? 'hoje' : dia.data === dias[1]?.data ? 'amanhã' : dataCurta(`${dia.data}T12:00:00-03:00`);
  chip.querySelector('b').textContent = `${rotulo}, ${dia.primeiro}`;
  chip.hidden = false;
}).catch(() => {});

// ---------------------------------------------------------------- frase do dia
const diaDoAno = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
let indice = diaDoAno % FRASES.length;
const caixaFrase = $('[data-frase]');
caixaFrase.textContent = FRASES[indice];
$('[data-outra-frase]').addEventListener('click', () => {
  indice = (indice + 1) % FRASES.length;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { caixaFrase.textContent = FRASES[indice]; return; }
  caixaFrase.classList.add('trocando');
  setTimeout(() => { caixaFrase.textContent = FRASES[indice]; caixaFrase.classList.remove('trocando'); }, 200);
});

// ---------------------------------------------------------------- onde fica
obterConfig().then((cfg) => {
  if (!cfg) return;
  const n = cfg.negocio;
  const endereco = [n.endereco, n.bairro, `${n.cidade} - ${n.uf}`].filter(Boolean).join(', ');
  if (n.endereco) {
    $('[data-endereco]').textContent = endereco;
    $('[data-rota]').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  }
  if (n.whatsapp) {
    const w = $('[data-whatsapp]');
    w.href = `https://wa.me/${n.whatsapp.startsWith('55') ? '' : '55'}${n.whatsapp}?text=${encodeURIComponent('Fala, Fortão! Vim pelo site.')}`;
    w.hidden = false;
  }
  // Agrupa dias com o mesmo horário: "Ter a Sex, 9h às 20h"
  const porFaixa = new Map();
  for (const f of cfg.funcionamento) {
    const chave = `${f.abre}-${f.fecha}`;
    porFaixa.set(chave, [...(porFaixa.get(chave) || []), f.dia_semana]);
  }
  const fmt = (t) => t.replace(':00', 'h').replace(/^0/, '').replace(/:(\d\d)$/, 'h$1');
  $('[data-funcionamento]').replaceChildren(...[...porFaixa].map(([faixa, dias]) => {
    const [abre, fecha] = faixa.split('-');
    const nomes = dias.length > 2 && dias.at(-1) - dias[0] === dias.length - 1 ? `${DIAS[dias[0]]} a ${DIAS[dias.at(-1)]}` : dias.map((d) => DIAS[d]).join(', ');
    return h('li', { class: 'chip' }, `${nomes}, ${fmt(abre)} às ${fmt(fecha)}`);
  }));
  const mapa = $('[data-mapa]');
  mapa.querySelector('button').addEventListener('click', () => {
    const q = encodeURIComponent(n.endereco ? endereco : 'Cohab 5, São Paulo');
    mapa.replaceChildren(h('iframe', { title: 'Mapa da Barbearia do Fortão', loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade', src: `https://www.google.com/maps?q=${q}&output=embed` }));
  });
});

