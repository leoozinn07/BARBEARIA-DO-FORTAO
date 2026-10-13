// Minha conta: horários (remarcar, cancelar, agenda do celular), perfil, aparência, senha e LGPD.
import { get, invalidarSessao, patch, post } from './api.js';
import { definirTema, iniciarCasca, obterConfig } from './casca.js';
import { montarAgendamento } from './agendamento.js';
import { acoesLembrete } from './lembrete.js';
import {
  abrirFolha, dataCurta, h, hora, icone, ligarVerSenha, limparErros, mostrarErros, ocupado, primeiroNome, quando, reais, telefoneBonito, toast, toastErro,
} from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const { usuario } = await iniciarCasca();
if (!usuario) {
  location.replace('/entrar?volta=/conta');
  throw new Error('Sem sessão');
}

$('[data-ola]').textContent = `Fala, ${primeiroNome(usuario.nome)}`;
$('[data-email]').textContent = usuario.email;
ligarVerSenha();

// ---------------------------------------------------------------- segmentos (abas internas)
function mostrarSegmento() {
  const alvo = ['horarios', 'perfil', 'privacidade'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'horarios';
  document.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== alvo; });
  document.querySelectorAll('[data-segmento]').forEach((a) => a.setAttribute('aria-current', String(a.dataset.segmento === alvo)));
}
window.addEventListener('hashchange', mostrarSegmento);
mostrarSegmento();

document.querySelectorAll('dialog [data-fechar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------------------------------------------------------------- verificação de e-mail
if (!usuario.email_verificado) {
  $('[data-aviso-verificar]').hidden = false;
  $('[data-reenviar]').addEventListener('click', async (e) => {
    try {
      await post('/auth/reenviar-verificacao');
      toast({ titulo: 'E-mail enviado', texto: `Confira a caixa de entrada de ${usuario.email}.` });
      e.target.disabled = true;
    } catch (erro) { toastErro(erro); }
  });
}

// ---------------------------------------------------------------- horários
const STATUS = { confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou' };
let config = null;

function abrirLembrete(ag) {
  const folha = $('[data-folha-lembrete]');
  $('[data-lembrete-texto]').textContent = `${ag.servico}, ${quando(ag.inicio)}.`;
  $('[data-lembrete-acoes]').replaceChildren(acoesLembrete(ag, config));
  abrirFolha(folha);
}

function cartaoHorario(ag) {
  const whatsapp = config?.negocio?.whatsapp;
  return h('article', { class: 'horario', 'aria-label': `${ag.servico}, ${quando(ag.inicio)}` },
    h('div', { class: 'horario__topo' },
      h('p', { class: 'horario__data' }, `${dataCurta(ag.inicio)}, ${hora(ag.inicio)}`, h('small', {}, ag.servico)),
      h('span', { class: `selo selo--${ag.status}` }, STATUS[ag.status]),
    ),
    h('p', { class: 'horario__info' },
      h('span', {}, icone('currency-circle-dollar'), `${reais(ag.preco_centavos)} na barbearia`),
      h('span', {}, icone('timer'), `${ag.duracao_min} min`),
      h('span', {}, icone('hash'), ag.codigo),
      ag.whatsapp_lembrete ? h('span', {}, icone('whatsapp-logo'), ag.presenca_confirmada ? 'Presença confirmada' : 'Lembrete no WhatsApp') : null,
    ),
    h('div', { class: 'horario__acoes' },
      h('button', { class: 'botao botao--suave', type: 'button', onclick: () => abrirLembrete(ag) }, icone('bell-ringing'), 'Lembrete'),
      ag.pode_alterar ? h('button', { class: 'botao botao--suave', type: 'button', onclick: () => abrirRemarcar(ag) }, icone('arrows-left-right'), 'Remarcar') : null,
      ag.pode_alterar ? h('button', { class: 'botao botao--suave', type: 'button', onclick: () => abrirCancelar(ag) }, icone('x-circle'), 'Cancelar') : null,
      h('a', { class: 'botao botao--suave', href: '/#onde' }, icone('map-pin'), 'Como chegar'),
    ),
    ag.pode_alterar ? null : h('p', { class: 'horario__nota' },
      `Faltam menos de ${config?.agenda?.cancelar_ate_horas ?? 2} h: já não dá para cancelar ou remarcar pelo site. Para mudar agora, fale com a barbearia`,
      whatsapp ? [' pelo ', h('a', { class: 'link', href: `https://wa.me/${whatsapp.startsWith('55') ? '' : '55'}${whatsapp}`, target: '_blank', rel: 'noopener' }, 'WhatsApp')] : '',
      '.'),
  );
}

async function carregarHorarios() {
  config ||= await obterConfig();
  try {
    const { proximos, historico } = await get('/conta/agendamentos');
    const vazio = () => h('div', { class: 'vazio' }, icone('calendar-blank'), h('b', {}, 'Nenhum horário marcado'), h('span', {}, 'Bora ficar na régua? Escolhe o dia e a hora.'),
      h('a', { class: 'botao botao--cheio', href: '/agendar' }, 'Marcar horário'));
    $('[data-proximos]').replaceChildren(...(proximos.length ? proximos.map(cartaoHorario) : [vazio()]));
    // No perfil, o próximo horário aparece logo no topo
    $('[data-proximo-perfil]').replaceChildren(proximos.length ? cartaoHorario(proximos[0]) : vazio());
    $('[data-historico]').replaceChildren(...(historico.length ? historico.map((ag) => h('li', {},
      h('span', {}, ag.servico), h('small', {}, `${dataCurta(ag.inicio)}, ${hora(ag.inicio)}, ${reais(ag.preco_centavos)}`), h('span', { class: `selo selo--${ag.status}` }, STATUS[ag.status]),
    )) : [h('li', {}, h('small', {}, 'Seus cortes anteriores aparecem aqui.'))]));
  } catch (e) {
    $('[data-proximos]').replaceChildren(h('p', { class: 'alerta alerta--erro' }, e.message));
  }
}

function abrirRemarcar(ag) {
  const folha = $('[data-folha-remarcar]');
  $('[data-remarcar-atual]').textContent = `Hoje está: ${ag.servico}, ${quando(ag.inicio)}. Escolha o novo dia e horário.`;
  montarAgendamento($('[data-remarcar-agenda]'), {
    servicoFixo: { slug: ag.servico_slug, nome: ag.servico, preco_centavos: ag.preco_centavos, duracao_min: ag.duracao_min },
    adicionaisFixos: ag.adicionais.map((a) => a.slug),
    inicial: {},
    rotulo: 'Confirmar novo horário',
    async aoConfirmar({ inicio }) {
      const { agendamento } = await post(`/agendamentos/${ag.codigo}/remarcar`, { inicio });
      folha.close();
      toast({ titulo: 'Horário remarcado', texto: `${agendamento.servico}, ${quando(agendamento.inicio)}.` });
      carregarHorarios();
    },
  });
  abrirFolha(folha);
}

function abrirCancelar(ag) {
  const folha = $('[data-folha-cancelar]');
  $('[data-cancelar-texto]').textContent = `${ag.servico}, ${quando(ag.inicio)}. O horário fica livre para outra pessoa.`;
  $('[data-cancelar-prazo]').textContent = `Dá para cancelar até ${config?.agenda?.cancelar_ate_horas ?? 2} horas antes do horário.`;
  const erro = $('[data-cancelar-erro]');
  erro.hidden = true;
  const botao = $('[data-cancelar-confirmar]');
  botao.onclick = async () => {
    ocupado(botao, true);
    try {
      await post(`/agendamentos/${ag.codigo}/cancelar`);
      folha.close();
      toast({ titulo: 'Horário cancelado', texto: 'Quando quiser, é só marcar de novo.' });
      carregarHorarios();
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
    } finally {
      ocupado(botao, false);
    }
  };
  abrirFolha(folha);
}

carregarHorarios();

// ---------------------------------------------------------------- perfil
const formPerfil = $('[data-form-perfil]');
formPerfil.elements.nome.value = usuario.nome;
formPerfil.elements.telefone.value = telefoneBonito(usuario.telefone);
formPerfil.elements.marketing.checked = usuario.marketing;
formPerfil.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = formPerfil.querySelector('[type="submit"]');
  limparErros(formPerfil);
  ocupado(botao, true);
  try {
    await patch('/conta', { nome: formPerfil.elements.nome.value, telefone: formPerfil.elements.telefone.value, marketing: formPerfil.elements.marketing.checked });
    invalidarSessao();
    toast({ titulo: 'Dados salvos', texto: 'Tudo certo com o seu perfil.' });
  } catch (e) {
    mostrarErros(formPerfil, e);
  } finally {
    ocupado(botao, false);
  }
});

// Aparência: aplica na hora e guarda na conta (vale em todos os aparelhos)
const prefs = { ...usuario.preferencias };
const raiz = document.documentElement;
document.querySelectorAll('[data-tema-opcoes] input').forEach((i) => {
  i.checked = i.value === (prefs.tema || 'escuro');
  i.addEventListener('change', () => salvarPreferencias({ tema: i.value }));
});
const letra = $('[data-letra-grande]');
letra.checked = Boolean(prefs.letra_grande);
letra.addEventListener('change', () => salvarPreferencias({ letra_grande: letra.checked }));

// O botão de tema do topo também muda a escolha aqui
document.addEventListener('tema-mudou', (e) => {
  prefs.tema = e.detail;
  document.querySelectorAll('[data-tema-opcoes] input').forEach((i) => { i.checked = i.value === e.detail; });
});

async function salvarPreferencias(mudanca) {
  Object.assign(prefs, mudanca);
  if (mudanca.tema) {
    definirTema(mudanca.tema, null);
    usuario.preferencias = { ...usuario.preferencias, tema: mudanca.tema };
  }
  if (prefs.letra_grande) raiz.dataset.letra = 'grande'; else delete raiz.dataset.letra;
  try {
    localStorage.setItem('fortao:tema', prefs.tema);
    localStorage.setItem('fortao:letra', prefs.letra_grande ? 'grande' : 'normal');
  } catch { /* sem armazenamento */ }
  try { await patch('/conta', { preferencias: mudanca }); } catch (e) { toastErro(e); }
}

// Trocar senha
const formSenha = $('[data-form-senha]');
formSenha.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = formSenha.querySelector('[type="submit"]');
  limparErros(formSenha);
  ocupado(botao, true);
  try {
    await post('/conta/senha', { senha_atual: formSenha.elements.senha_atual.value, senha_nova: formSenha.elements.senha_nova.value });
    formSenha.reset();
    toast({ titulo: 'Senha trocada', texto: 'As outras sessões da sua conta foram encerradas.' });
  } catch (e) {
    mostrarErros(formSenha, e);
  } finally {
    ocupado(botao, false);
  }
});

$('[data-sair]').addEventListener('click', async () => {
  await post('/auth/sair').catch(() => {});
  invalidarSessao();
  location.replace('/');
});

// ---------------------------------------------------------------- excluir conta
const folhaExcluir = $('[data-folha-excluir]');
$('[data-excluir-abrir]').addEventListener('click', () => abrirFolha(folhaExcluir));
const formExcluir = $('[data-form-excluir]');
formExcluir.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = formExcluir.querySelector('[type="submit"]');
  limparErros(formExcluir);
  ocupado(botao, true);
  try {
    await post('/conta/excluir', { senha: formExcluir.elements.senha.value });
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* sem armazenamento */ }
    location.replace('/?conta=excluida');
  } catch (e) {
    mostrarErros(formExcluir, e);
  } finally {
    ocupado(botao, false);
  }
});
