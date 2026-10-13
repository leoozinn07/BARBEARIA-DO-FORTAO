// Painel do Fortão: resumo, agenda do dia, rendimento, novo horário, folgas, serviços, funcionamento, barbearia e clientes.
import { del, get, post, put } from './api.js';
import { iniciarCasca } from './casca.js';
import { abrirMensagem, linkWhatsapp, salvarContato } from './contato.js';
import { montarRendimento } from './rendimento.js';
import {
  abrirFolha, dataLonga, h, hojeISO, hora, icone, limparErros, mostrarErros, ocupado, reais, relativo, telefoneBonito, toast, toastErro,
} from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const { usuario } = await iniciarCasca();
if (usuario?.papel !== 'admin') {
  location.replace('/entrar?volta=/admin');
  throw new Error('Sem permissão');
}

const STATUS = { confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou' };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const meioDia = (iso) => `${iso}T12:00:00-03:00`;
let dia = hojeISO();
let servicos = [];

document.querySelectorAll('dialog [data-fechar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$('[data-hoje]').textContent = dataLonga(meioDia(hojeISO())).replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------- segmentos
const SEGMENTOS = ['agenda', 'rendimento', 'bloqueios', 'servicos', 'funcionamento', 'barbearia', 'clientes'];
const carregados = new Set();
function mostrarSegmento() {
  const alvo = SEGMENTOS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'agenda';
  document.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== alvo; });
  document.querySelectorAll('[data-segmento]').forEach((a) => a.setAttribute('aria-current', String(a.dataset.segmento === alvo)));
  if (!carregados.has(alvo)) {
    carregados.add(alvo);
    ({ rendimento: () => montarRendimento($('[data-painel="rendimento"]')), bloqueios: carregarBloqueios, servicos: carregarServicos, funcionamento: carregarFuncionamento, barbearia: carregarBarbearia, clientes: () => buscarClientes('') })[alvo]?.();
  }
}
window.addEventListener('hashchange', mostrarSegmento);

// ---------------------------------------------------------------- resumo
async function carregarResumo() {
  try {
    const r = await get(`/admin/resumo?data=${dia}`);
    $('[data-aviso-email]').hidden = r.email_real;
    const ativos = (x) => x.total - x.cancelados;
    $('[data-resumo]').replaceChildren(
      h('div', { class: 'resumo__item' }, h('small', {}, dia === hojeISO() ? 'Hoje' : 'Neste dia'), h('b', {}, String(ativos(r.dia))), h('span', {}, `horários, ${reais(r.dia.previsto_centavos)}`)),
      h('div', { class: 'resumo__item' }, h('small', {}, '7 dias'), h('b', {}, String(ativos(r.semana))), h('span', {}, `previsto ${reais(r.semana.previsto_centavos)}`)),
      h('a', { class: 'resumo__item', href: '#rendimento' }, h('small', {}, 'Recebido no mês'), h('b', {}, reais(r.mes.realizado_centavos)), h('span', {}, `${r.mes.faltas} falta${r.mes.faltas === 1 ? '' : 's'} · ver rendimento`)),
      h('div', { class: 'resumo__item' }, h('small', {}, 'Clientes'), h('b', {}, String(r.clientes)), h('span', {}, 'com conta no site')),
    );
  } catch (e) {
    $('[data-resumo]').replaceChildren(h('p', { class: 'alerta alerta--erro' }, e.message));
  }
}

// ---------------------------------------------------------------- agenda do dia
async function mudarStatus(ag, status) {
  try {
    await post(`/admin/agendamentos/${ag.codigo}/status`, { status });
    toast({ titulo: STATUS[status], texto: `${ag.cliente_nome}, ${hora(ag.inicio)}.` });
    carregarAgenda();
  } catch (e) { toastErro(e); }
}

function itemAgendamento(ag) {
  const comecou = new Date(ag.inicio).getTime() <= Date.now() + 30 * 60000;
  const acoes = [];
  if (ag.status === 'confirmado') {
    if (comecou) {
      acoes.push(h('button', { class: 'botao botao--cheio', type: 'button', onclick: () => mudarStatus(ag, 'concluido') }, icone('check'), 'Concluído'));
      acoes.push(h('button', { class: 'botao botao--suave', type: 'button', onclick: () => mudarStatus(ag, 'faltou') }, icone('user-minus'), 'Faltou'));
    }
    acoes.push(h('button', { class: 'botao botao--suave', type: 'button', onclick: () => abrirRemarcar(ag) }, icone('arrows-left-right'), 'Remarcar'));
    acoes.push(h('button', { class: 'botao botao--suave', type: 'button', onclick: () => abrirCancelar(ag) }, icone('x'), 'Cancelar'));
  } else if (ag.status === 'concluido' || ag.status === 'faltou') {
    acoes.push(h('button', { class: 'botao botao--suave', type: 'button', onclick: () => mudarStatus(ag, 'confirmado') }, icone('arrow-counter-clockwise'), 'Desfazer'));
  }
  if (ag.cliente_telefone) {
    acoes.push(h('button', { class: 'botao botao--suave', type: 'button', onclick: () => mensagemDoHorario(ag) }, icone('whatsapp-logo'), 'Mensagem'));
  }
  return h('li', { class: 'item-agenda', 'data-status': ag.status },
    h('div', { class: 'item-agenda__hora' }, h('b', {}, hora(ag.inicio)), h('small', {}, `até ${hora(ag.fim)}`)),
    h('div', { class: 'item-agenda__corpo' },
      h('p', { class: 'item-agenda__nome' }, ag.cliente_nome, h('span', { class: `selo selo--${ag.status}` }, STATUS[ag.status]),
        ag.origem === 'admin' ? h('span', { class: 'selo' }, 'Balcão') : null),
      h('p', { class: 'item-agenda__detalhe' },
        h('span', {}, `${ag.servico}, ${reais(ag.preco_centavos)}`),
        ag.cliente_telefone ? h('a', { href: linkWhatsapp(ag.cliente_telefone), target: '_blank', rel: 'noopener' }, icone('whatsapp-logo'), ` ${telefoneBonito(ag.cliente_telefone)}`) : null,
        ag.observacao ? h('span', {}, `Obs.: ${ag.observacao}`) : null,
        ag.status === 'cancelado' && ag.motivo_cancelamento ? h('span', {}, `Motivo: ${ag.motivo_cancelamento}`) : null,
      ),
      acoes.length ? h('div', { class: 'item-agenda__acoes' }, ...acoes) : null,
    ),
  );
}

/** Mensagem pronta para o cliente do horário, no WhatsApp do próprio Fortão. */
function mensagemDoHorario(ag, modelo) {
  const futuro = ag.status === 'confirmado' && new Date(ag.inicio).getTime() > Date.now();
  abrirMensagem({ nome: ag.cliente_nome, telefone: ag.cliente_telefone, email: ag.cliente_email, ag, modelo: modelo ?? (futuro ? 'lembrete' : 'livre') });
}

function itemBloqueio(b) {
  return h('li', { class: 'item-agenda item-bloqueio' },
    h('div', { class: 'item-agenda__hora' }, h('b', {}, hora(b.inicio)), h('small', {}, `até ${hora(b.fim)}`)),
    h('div', { class: 'item-agenda__corpo' }, h('p', { class: 'item-agenda__nome' }, icone('lock-simple'), 'Agenda fechada'), b.motivo ? h('p', { class: 'item-agenda__detalhe' }, b.motivo) : null),
    h('button', { class: 'botao botao--suave botao--p', type: 'button', onclick: () => removerBloqueio(b.id) }, 'Reabrir'),
  );
}

async function carregarAgenda() {
  $('[data-dia]').value = dia;
  $('[data-agenda-titulo]').textContent = dia === hojeISO() ? 'Agenda de hoje' : `Agenda de ${dataLonga(meioDia(dia))}`;
  const lista = $('[data-agenda]');
  lista.replaceChildren(h('li', { class: 'esqueleto esqueleto--horario' }));
  carregarResumo();
  try {
    const { agendamentos, bloqueios } = await get(`/admin/agenda?de=${dia}`);
    const itens = [...agendamentos.map((a) => ({ t: a.inicio, el: itemAgendamento(a) })), ...bloqueios.map((b) => ({ t: new Date(b.inicio).toISOString(), el: itemBloqueio(b) }))]
      .sort((x, y) => x.t.localeCompare(y.t));
    lista.replaceChildren(...(itens.length ? itens.map((i) => i.el) : [
      h('li', { class: 'vazio' }, icone('coffee'), h('b', {}, 'Agenda livre'), h('span', {}, 'Nenhum horário marcado neste dia.')),
    ]));
  } catch (e) {
    lista.replaceChildren(h('li', { class: 'alerta alerta--erro' }, e.message));
  }
}

$('[data-dia-anterior]').addEventListener('click', () => { dia = somarDias(dia, -1); carregarAgenda(); });
$('[data-dia-proximo]').addEventListener('click', () => { dia = somarDias(dia, 1); carregarAgenda(); });
$('[data-dia-hoje]').addEventListener('click', () => { dia = hojeISO(); carregarAgenda(); });
$('[data-dia]').addEventListener('change', (e) => { if (e.target.value) { dia = e.target.value; carregarAgenda(); } });

// ---------------------------------------------------------------- grade de horários (novo e remarcar)
async function desenharHorarios(caixa, { servico, data, ignorar, adicionais = [] }) {
  caixa.replaceChildren(h('div', { class: 'esqueleto ag-hora-esq' }), h('div', { class: 'esqueleto ag-hora-esq' }));
  try {
    const extras = adicionais.length ? `&adicionais=${encodeURIComponent(adicionais.join(','))}` : '';
    const { horarios } = await get(`/admin/horarios?servico=${servico}${extras}&data=${data}${ignorar ? `&ignorar=${ignorar}` : ''}`);
    caixa.replaceChildren(...(horarios.length ? horarios.map((x) => h('label', { class: 'ag-hora' }, h('input', { type: 'radio', name: 'inicio', value: x.inicio }), x.hora))
      : [h('p', { class: 'subtitulo' }, 'Sem horário livre nesse dia.')]));
  } catch (e) {
    caixa.replaceChildren(h('p', { class: 'alerta alerta--erro' }, e.message));
  }
}

// ---------------------------------------------------------------- novo horário
const folhaNovo = $('[data-folha-novo]');
const formNovo = $('[data-form-novo]');
async function abrirNovo() {
  limparErros(formNovo);
  formNovo.reset();
  servicos = servicos.length ? servicos : (await get('/admin/servicos')).servicos;
  const ativos = servicos.filter((s) => s.ativo);
  $('[data-novo-servico]').replaceChildren(...ativos.filter((s) => s.tipo === 'principal').map((s) => h('option', { value: s.slug }, `${s.nome} (${reais(s.preco_centavos)}, ${s.duracao_min} min)`)));
  const extras = ativos.filter((s) => s.tipo === 'adicional');
  $('[data-novo-adicionais-grupo]').hidden = !extras.length;
  $('[data-novo-adicionais]').replaceChildren(...extras.map((a) => h('label', { class: 'ag-adicional' },
    h('input', { type: 'checkbox', name: 'adicional', value: a.slug, onchange: () => atualizarNovo() }),
    h('span', { class: 'ag-adicional__nome' }, a.nome),
    h('span', { class: 'ag-adicional__info' }, `+ ${reais(a.preco_centavos)} · ${a.duracao_min} min`),
  )));
  $('[data-novo-dia]').value = dia;
  alternarTipo();
  atualizarNovo();
  abrirFolha(folhaNovo);
}
const adicionaisDoNovo = () => [...formNovo.querySelectorAll('input[name="adicional"]:checked')].map((i) => i.value);
const atualizarNovo = () => desenharHorarios($('[data-novo-horarios]'), { servico: formNovo.elements.servico.value, data: formNovo.elements.dia.value, adicionais: adicionaisDoNovo() });
function alternarTipo() {
  const conta = formNovo.elements.tipo.value === 'conta';
  $('[data-campos-avulso]').hidden = conta;
  $('[data-campos-conta]').hidden = !conta;
}
$('[data-novo-abrir]').addEventListener('click', abrirNovo);
formNovo.elements.servico.addEventListener('change', atualizarNovo);
formNovo.elements.dia.addEventListener('change', atualizarNovo);
formNovo.querySelectorAll('[name="tipo"]').forEach((r) => r.addEventListener('change', alternarTipo));
formNovo.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = formNovo.elements;
  const botao = formNovo.querySelector('[type="submit"]');
  limparErros(formNovo);
  const inicio = formNovo.querySelector('input[name="inicio"]:checked')?.value;
  if (!inicio) { mostrarErros(formNovo, { campos: { inicio: 'Escolha um horário.' } }); return; }
  ocupado(botao, true);
  try {
    const corpo = { servico: f.servico.value, adicionais: adicionaisDoNovo(), inicio, observacao: f.observacao.value || undefined };
    if (f.tipo.value === 'conta') corpo.email_cliente = f.email_cliente.value; else Object.assign(corpo, { nome: f.nome.value, telefone: f.telefone.value });
    const { agendamento } = await post('/admin/agendamentos', corpo);
    folhaNovo.close();
    toast({ titulo: 'Horário marcado', texto: `${agendamento.cliente_nome}, ${hora(agendamento.inicio)}.` });
    dia = formNovo.elements.dia.value;
    carregarAgenda();
  } catch (e) {
    mostrarErros(formNovo, e);
    if (e.codigo === 'horario_ocupado') atualizarNovo();
  } finally {
    ocupado(botao, false);
  }
});

// ---------------------------------------------------------------- cancelar e remarcar
const folhaCancelar = $('[data-folha-cancelar]');
const formCancelar = $('[data-form-cancelar]');
let alvo = null;
function abrirCancelar(ag) {
  alvo = ag;
  formCancelar.reset();
  limparErros(formCancelar);
  $('[data-cancelar-texto]').textContent = `${ag.cliente_nome}: ${ag.servico}, ${dataLonga(ag.inicio)} às ${hora(ag.inicio)}.`;
  abrirFolha(folhaCancelar);
}
formCancelar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = formCancelar.querySelector('[type="submit"]');
  ocupado(botao, true);
  try {
    const { agendamento } = await post(`/admin/agendamentos/${alvo.codigo}/cancelar`, { motivo: formCancelar.elements.motivo.value || undefined });
    folhaCancelar.close();
    toast({ titulo: 'Horário cancelado', texto: alvo.cliente_email ? 'O cliente foi avisado por e-mail e na conta dele.' : 'Avise o cliente pelo WhatsApp.' });
    carregarAgenda();
    // Cliente do balcão não tem e-mail: a mensagem de aviso já abre pronta
    if (!alvo.cliente_email && alvo.cliente_telefone) mensagemDoHorario({ ...alvo, ...agendamento }, 'cancelado');
  } catch (e) { mostrarErros(formCancelar, e); } finally { ocupado(botao, false); }
});

const folhaRemarcar = $('[data-folha-remarcar]');
const formRemarcar = $('[data-form-remarcar]');
function abrirRemarcar(ag) {
  alvo = ag;
  limparErros(formRemarcar);
  $('[data-remarcar-texto]').textContent = `${ag.cliente_nome}: ${ag.servico}, hoje marcado para ${dataLonga(ag.inicio)} às ${hora(ag.inicio)}.`;
  $('[data-remarcar-dia]').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ag.inicio));
  atualizarRemarcar();
  abrirFolha(folhaRemarcar);
}
const atualizarRemarcar = () => desenharHorarios($('[data-remarcar-horarios]'), { servico: alvo.servico_slug, data: $('[data-remarcar-dia]').value, ignorar: alvo.codigo });
$('[data-remarcar-dia]').addEventListener('change', atualizarRemarcar);
formRemarcar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const inicio = formRemarcar.querySelector('input[name="inicio"]:checked')?.value;
  if (!inicio) { mostrarErros(formRemarcar, { message: 'Escolha o novo horário.', campos: {} }); return; }
  const botao = formRemarcar.querySelector('[type="submit"]');
  ocupado(botao, true);
  try {
    const { agendamento } = await post(`/admin/agendamentos/${alvo.codigo}/remarcar`, { inicio });
    folhaRemarcar.close();
    toast({ titulo: 'Remarcado', texto: alvo.cliente_email ? 'O cliente recebeu o novo horário por e-mail.' : 'Avise o cliente pelo WhatsApp.' });
    carregarAgenda();
    if (!alvo.cliente_email && alvo.cliente_telefone) mensagemDoHorario({ ...alvo, ...agendamento }, 'remarcado');
  } catch (e) { mostrarErros(formRemarcar, e); } finally { ocupado(botao, false); }
});

// ---------------------------------------------------------------- folgas (bloqueios)
const formBloqueio = $('[data-form-bloqueio]');
formBloqueio.elements.data.value = hojeISO();
$('[data-dia-inteiro]').addEventListener('change', (e) => { $('[data-faixa-bloqueio]').hidden = e.target.checked; });
formBloqueio.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = formBloqueio.elements;
  const botao = formBloqueio.querySelector('[type="submit"]');
  limparErros(formBloqueio);
  ocupado(botao, true);
  try {
    const r = await post('/admin/bloqueios', { data: f.data.value, dia_inteiro: f.dia_inteiro.checked, de: f.de.value, ate: f.ate.value, motivo: f.motivo.value });
    toast({
      titulo: 'Agenda fechada',
      texto: r.conflitos.length ? `Atenção: ${r.conflitos.length} cliente(s) já marcado(s) nesse período. Veja na agenda e remarque.` : 'Ninguém consegue marcar nesse período.',
      tempo: r.conflitos.length ? 9000 : 4200,
    });
    carregarBloqueios();
    if (f.data.value === dia) carregarAgenda();
  } catch (e) { mostrarErros(formBloqueio, e); } finally { ocupado(botao, false); }
});

async function carregarBloqueios() {
  const lista = $('[data-bloqueios]');
  try {
    const { bloqueios } = await get(`/admin/agenda?de=${hojeISO()}&ate=${somarDias(hojeISO(), 60)}`);
    lista.replaceChildren(...(bloqueios.length ? bloqueios.map((b) => h('li', {},
      h('div', {}, h('b', {}, dataLonga(b.inicio)), h('small', {}, `${hora(b.inicio)} até ${hora(b.fim)}${b.motivo ? `, ${b.motivo}` : ''}`)),
      h('button', { class: 'botao botao--suave botao--p', type: 'button', onclick: () => removerBloqueio(b.id) }, 'Reabrir'),
    )) : [h('li', {}, h('small', {}, 'Nenhuma folga marcada nos próximos 60 dias.'))]));
  } catch (e) { lista.replaceChildren(h('li', { class: 'alerta alerta--erro' }, e.message)); }
}

async function removerBloqueio(id) {
  try {
    await del(`/admin/bloqueios/${id}`);
    toast({ titulo: 'Agenda reaberta', texto: 'Os horários voltaram a aparecer para os clientes.' });
    carregarBloqueios();
    carregarAgenda();
  } catch (e) { toastErro(e); }
}

// ---------------------------------------------------------------- serviços
async function carregarServicos() {
  servicos = (await get('/admin/servicos')).servicos;
  const cartao = (s) => {
    const form = h('form', { class: 'servico-admin', novalidate: true },
      h('div', { class: 'campo' }, h('label', { for: `s-nome-${s.id}` }, 'Nome'), h('input', { id: `s-nome-${s.id}`, name: 'nome', value: s.nome, maxlength: 80 })),
      h('div', { class: 'duas-colunas' },
        h('div', { class: 'campo' }, h('label', { for: `s-preco-${s.id}` }, 'Preço (R$)'), h('input', { id: `s-preco-${s.id}`, name: 'preco', type: 'number', min: 0, step: '0.5', inputmode: 'decimal', value: s.preco_centavos / 100 })),
        h('div', { class: 'campo' }, h('label', { for: `s-dur-${s.id}` }, s.tipo === 'adicional' ? 'Tempo a mais (min)' : 'Duração (min)'), h('input', { id: `s-dur-${s.id}`, name: 'duracao', type: 'number', min: 5, step: 5, inputmode: 'numeric', value: s.duracao_min })),
      ),
      h('div', { class: 'campo' }, h('label', { for: `s-desc-${s.id}` }, 'Descrição'), h('input', { id: `s-desc-${s.id}`, name: 'descricao', value: s.descricao, maxlength: 255 })),
      h('div', { class: 'servico-admin__rodape' },
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'ativo', checked: Boolean(s.ativo) }), h('span', {}, 'Aparece para os clientes')),
        h('div', { class: 'servico-admin__acoes' },
          h('button', { class: 'botao botao--suave botao--p', type: 'button', onclick: () => removerServico(s) }, 'Remover'),
          h('button', { class: 'botao botao--cheio botao--p', type: 'submit' }, 'Salvar'),
        ),
      ),
    );
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = form.elements;
      const botao = form.querySelector('[type="submit"]');
      ocupado(botao, true);
      try {
        await put(`/admin/servicos/${s.id}`, {
          nome: f.nome.value, descricao: f.descricao.value, tipo: s.tipo, preco_centavos: Math.round(Number(f.preco.value) * 100),
          duracao_min: Number(f.duracao.value), ativo: f.ativo.checked, ordem: s.ordem,
        });
        servicos = [];
        toast({ titulo: 'Serviço salvo', texto: `${f.nome.value}: ${reais(Math.round(Number(f.preco.value) * 100))}.` });
      } catch (e) { toastErro(e); } finally { ocupado(botao, false); }
    });
    return form;
  };
  $('[data-servicos]').replaceChildren(...servicos.filter((s) => s.tipo !== 'adicional').map(cartao));
  const extras = servicos.filter((s) => s.tipo === 'adicional');
  $('[data-adicionais]').replaceChildren(...(extras.length ? extras.map(cartao) : [h('p', { class: 'subtitulo' }, 'Nenhum adicional. Crie um logo abaixo, escolhendo o tipo "Adicional".')]));
}

async function removerServico(s) {
  if (!window.confirm(`Remover "${s.nome}"? Ele some da tabela e da agenda.`)) return;
  try {
    await del(`/admin/servicos/${s.id}`);
    toast({ titulo: 'Serviço removido', texto: `${s.nome} saiu da tabela.` });
    servicos = [];
    carregarServicos();
  } catch (e) { toastErro(e, 'Não deu para remover'); }
}

const formNovoServico = $('[data-form-novo-servico]');
formNovoServico.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = formNovoServico.elements;
  const slug = f.nome.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const botao = formNovoServico.querySelector('[type="submit"]');
  limparErros(formNovoServico);
  ocupado(botao, true);
  try {
    const tipo = f.tipo.value;
    const atuais = (await get('/admin/servicos')).servicos;
    const ordem = Math.max(0, ...atuais.filter((s) => s.tipo === tipo).map((s) => s.ordem)) + 1;
    await post('/admin/servicos', {
      slug, nome: f.nome.value, descricao: f.descricao.value, tipo, preco_centavos: Math.round(Number(f.preco.value) * 100),
      duracao_min: Number(f.duracao.value), ativo: true, ordem: tipo === 'adicional' ? Math.max(ordem, 10) : ordem,
    });
    formNovoServico.reset();
    toast({ titulo: tipo === 'adicional' ? 'Adicional criado' : 'Serviço criado', texto: 'Já aparece para os clientes.' });
    servicos = [];
    carregarServicos();
  } catch (e) { mostrarErros(formNovoServico, e); } finally { ocupado(botao, false); }
});

// ---------------------------------------------------------------- funcionamento
async function carregarFuncionamento() {
  const { faixas } = await get('/admin/funcionamento');
  $('[data-semana]').replaceChildren(...[1, 2, 3, 4, 5, 6, 0].map((d) => {
    const doDia = faixas.filter((f) => f.dia_semana === d);
    const faixa = (i, f) => h('div', { class: 'faixa', ...(i === 1 ? { 'data-pausa': '' } : {}) },
      h('input', { type: 'time', step: 900, name: `abre-${d}-${i}`, value: f?.abre || (i ? '14:00' : '09:00'), 'aria-label': `${DIAS[d]}: abre` }),
      h('span', {}, 'às'),
      h('input', { type: 'time', step: 900, name: `fecha-${d}-${i}`, value: f?.fecha || (i ? '20:00' : '12:00'), 'aria-label': `${DIAS[d]}: fecha` }),
    );
    const caixaPausa = h('div', { class: 'dia-semana__faixas', hidden: doDia.length < 2 }, faixa(1, doDia[1]));
    const bloco = h('div', { class: 'dia-semana', 'data-fechado': String(!doDia.length), 'data-dia': d },
      h('div', { class: 'dia-semana__topo' },
        h('b', {}, DIAS[d]),
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: `aberto-${d}`, checked: doDia.length > 0, onchange: (e) => { bloco.dataset.fechado = String(!e.target.checked); } }), h('span', {}, 'Aberto')),
      ),
      h('div', { class: 'dia-semana__faixas' }, faixa(0, doDia[0] || { abre: '09:00', fecha: '20:00' })),
      caixaPausa,
      h('label', { class: 'marcar', 'data-pausa': '' }, h('input', { type: 'checkbox', name: `pausa-${d}`, checked: doDia.length > 1, onchange: (e) => { caixaPausa.hidden = !e.target.checked; } }), h('span', {}, 'Tem pausa (ex.: almoço)')),
    );
    return bloco;
  }));
}

const formFunc = $('[data-form-funcionamento]');
formFunc.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = formFunc.elements;
  const faixas = [];
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    if (!f[`aberto-${d}`]?.checked) continue;
    faixas.push({ dia_semana: d, abre: f[`abre-${d}-0`].value, fecha: f[`fecha-${d}-0`].value });
    if (f[`pausa-${d}`].checked) faixas.push({ dia_semana: d, abre: f[`abre-${d}-1`].value, fecha: f[`fecha-${d}-1`].value });
  }
  const botao = formFunc.querySelector('[type="submit"]');
  limparErros(formFunc);
  ocupado(botao, true);
  try {
    await put('/admin/funcionamento', { faixas });
    toast({ titulo: 'Horários salvos', texto: 'A agenda dos clientes já segue os novos horários.' });
  } catch (e) { mostrarErros(formFunc, e); } finally { ocupado(botao, false); }
});

// ---------------------------------------------------------------- dados da barbearia
const formBarb = $('[data-form-barbearia]');
async function carregarBarbearia() {
  const cfg = await get('/admin/config');
  for (const el of formBarb.elements) {
    if (!el.name?.includes('.')) continue;
    const [grupo, chave] = el.name.split('.');
    el.value = cfg[grupo]?.[chave] ?? '';
  }
}
formBarb.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const corpo = { negocio: {}, agenda: {} };
  for (const el of formBarb.elements) {
    if (!el.name?.includes('.')) continue;
    const [grupo, chave] = el.name.split('.');
    corpo[grupo][chave] = grupo === 'agenda' ? Number(el.value) : el.value;
  }
  corpo.negocio.uf = 'SP';
  const botao = formBarb.querySelector('[type="submit"]');
  limparErros(formBarb);
  ocupado(botao, true);
  try {
    await put('/admin/config', corpo);
    toast({ titulo: 'Dados salvos', texto: 'Endereço e regras atualizados no site e nos e-mails.' });
  } catch (e) { mostrarErros(formBarb, e); } finally { ocupado(botao, false); }
});

// ---------------------------------------------------------------- clientes
let timerBusca;
$('[data-busca]').addEventListener('input', (e) => { clearTimeout(timerBusca); timerBusca = setTimeout(() => buscarClientes(e.target.value), 250); });
async function buscarClientes(q) {
  const lista = $('[data-clientes]');
  try {
    const { clientes } = await get(`/admin/clientes?q=${encodeURIComponent(q)}`);
    lista.replaceChildren(...(clientes.length ? clientes.map((c) => h('li', {},
      h('div', {}, h('b', {}, c.nome), h('small', {}, [c.email, telefoneBonito(c.telefone)].filter(Boolean).join(' · ')),
        h('small', {}, `${c.concluidos} corte${c.concluidos === 1 ? '' : 's'}${c.faltas ? `, ${c.faltas} falta${c.faltas === 1 ? '' : 's'}` : ''}${c.ultimo ? `, último ${relativo(c.ultimo)}` : ''}`)),
      c.telefone ? h('div', { class: 'lista-admin__acoes' },
        h('button', { class: 'icone-botao', type: 'button', 'aria-label': `Salvar contato de ${c.nome}`, title: 'Salvar contato', onclick: () => salvarContato({ nome: c.nome, telefone: c.telefone, email: c.email }) }, icone('address-book')),
        h('button', { class: 'icone-botao', type: 'button', 'aria-label': `Mensagem no WhatsApp para ${c.nome}`, title: 'Mensagem no WhatsApp', onclick: () => abrirMensagem({ nome: c.nome, telefone: c.telefone, email: c.email }) }, icone('whatsapp-logo'))) : h('span'),
    )) : [h('li', {}, h('small', {}, q ? 'Ninguém encontrado.' : 'Os clientes com conta aparecem aqui.'))]));
  } catch (e) { lista.replaceChildren(h('li', { class: 'alerta alerta--erro' }, e.message)); }
}

mostrarSegmento();
carregarAgenda();
