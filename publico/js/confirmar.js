// Confirmação antes de marcar ("Tem certeza e consciência...?") com o mini formulário do WhatsApp,
// e a folha de sucesso com os lembretes. As duas folhas são montadas aqui para servir à página inicial e a /agendar.
import { invalidarSessao, post } from './api.js';
import { esquecerEscolha, pacote } from './agendamento.js';
import { acoesLembrete } from './lembrete.js';
import { abrirFolha, h, icone, limparErros, mostrarErros, ocupado, quando, reais, telefoneBonito } from './ui.js';

function folha(...conteudo) {
  const d = h('dialog', { class: 'folha' }, h('div', { class: 'folha__alca', 'aria-hidden': 'true' }), ...conteudo);
  document.body.append(d);
  d.addEventListener('close', () => setTimeout(() => d.remove(), 400), { once: true });
  return d;
}

const digitos = (t) => String(t || '').replace(/\D/g, '');
const telefoneValido = (t) => /^(55)?\d{10,11}$/.test(digitos(t));

/**
 * Pergunta se o cliente tem certeza do horário e pede o WhatsApp.
 * enviar({ telefone, whatsapp }) marca de verdade. Resolve com o que enviar devolver, ou null se ele desistir.
 * Se o horário foi ocupado enquanto isso, fecha e rejeita: o componente atualiza a grade.
 */
export function confirmarHorario({ nome, inicio, precoCentavos, duracaoMin, telefone, enviar }) {
  return new Promise((resolver, rejeitar) => {
    const form = h('form', { class: 'folha__corpo confirmar', novalidate: true },
      h('h2', { class: 'titulo', id: 'confirmar-titulo' }, 'Confere antes de marcar'),
      h('dl', { class: 'confirmar__resumo' },
        h('div', {}, h('dt', {}, 'Serviço'), h('dd', {}, nome)),
        h('div', {}, h('dt', {}, 'Quando'), h('dd', {}, quando(inicio))),
        h('div', {}, h('dt', {}, 'Valor'), h('dd', {}, `${reais(precoCentavos)}, pago na barbearia`)),
        h('div', {}, h('dt', {}, 'Duração'), h('dd', {}, `${duracaoMin} min`)),
      ),
      h('p', { class: 'alerta alerta--erro', 'data-erro-geral': '', role: 'alert', tabindex: '-1', hidden: true }),
      h('div', { class: 'campo' },
        h('label', { for: 'confirmar-telefone' }, 'Seu WhatsApp com DDD'),
        h('input', { id: 'confirmar-telefone', name: 'telefone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', required: true, placeholder: '(11) 91234-5678', value: telefoneBonito(digitos(telefone).replace(/^55(?=\d{10,11}$)/, '')), 'aria-describedby': 'confirmar-telefone-erro' }),
        h('p', { class: 'erro-campo', id: 'confirmar-telefone-erro', 'data-erro-de': 'telefone' }),
      ),
      h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'whatsapp', checked: true }),
        h('span', {}, 'Quero receber a confirmação e os lembretes neste WhatsApp (1 dia antes e 2 horas antes).')),
      h('p', { class: 'confirmar__pergunta' }, 'Tem certeza e consciência de que esse será o horário agendado?'),
      h('div', { class: 'confirmar__botoes' },
        h('button', { class: 'botao botao--linha', type: 'button', 'data-nao': '' }, 'Não, voltar'),
        h('button', { class: 'botao botao--cheio', type: 'submit' }, icone('check'), 'Sim, confirmar'),
      ),
    );
    const d = folha(form);
    d.setAttribute('aria-labelledby', 'confirmar-titulo');
    let terminou = false;
    const fim = (fn) => { terminou = true; d.close(); fn(); };

    form.querySelector('[data-nao]').addEventListener('click', () => fim(() => resolver(null)));
    d.addEventListener('close', () => { if (!terminou) resolver(null); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      const tel = form.elements.telefone.value;
      if (!telefoneValido(tel)) {
        mostrarErros(form, { message: 'Confira o número.', campos: { telefone: 'Informe o WhatsApp com DDD, por exemplo (11) 91234-5678.' } });
        return;
      }
      const botao = form.querySelector('[type="submit"]');
      ocupado(botao, true);
      try {
        const resultado = await enviar({ telefone: digitos(tel), whatsapp: form.elements.whatsapp.checked });
        fim(() => resolver(resultado));
      } catch (e) {
        if (e.codigo === 'horario_ocupado' || e.codigo === 'limite_horarios') fim(() => rejeitar(e));
        else mostrarErros(form, e);
      } finally {
        ocupado(botao, false);
      }
    });
    abrirFolha(d);
    form.elements.telefone.focus({ preventScroll: true });
  });
}

/** "Fechou! Horário marcado." com os botões de lembrete. aoFechar roda quando a folha fecha. */
export function mostrarSucesso(ag, config, aoFechar) {
  const d = folha(h('div', { class: 'folha__corpo' },
    h('div', { class: 'sucesso__icone' }, icone('check-circle', 'ph-fill')),
    h('h2', { class: 'titulo', id: 'sucesso-titulo' }, 'Fechou! Horário marcado.'),
    h('p', { class: 'subtitulo' }, `${ag.servico}, ${quando(ag.inicio)}. Valor: ${reais(ag.preco_centavos)}, pago na barbearia.`),
    h('h3', { class: 'lembrete__titulo' }, 'Adicionar lembrete'),
    acoesLembrete(ag, config),
    h('a', { class: 'botao botao--cheio botao--bloco', href: '/conta#horarios' }, 'Ver meus horários'),
  ));
  d.setAttribute('aria-labelledby', 'sucesso-titulo');
  if (aoFechar) d.addEventListener('close', aoFechar, { once: true });
  abrirFolha(d);
}

/** O fluxo completo depois de "Marcar horário": confirma, marca, mostra o sucesso. Devolve o horário ou null. */
export async function marcarComConfirmacao({ servico, adicionais = [], inicio, usuario, config, aoFechar }) {
  const p = pacote(servico, adicionais);
  const agendamento = await confirmarHorario({
    nome: p.nome,
    inicio,
    precoCentavos: p.preco_centavos,
    duracaoMin: p.duracao_min,
    telefone: usuario.telefone,
    enviar: async ({ telefone, whatsapp }) => (await post('/agendamentos', {
      servico: servico.slug, adicionais: adicionais.map((a) => a.slug), inicio, telefone, whatsapp,
    })).agendamento,
  });
  if (!agendamento) return null;
  usuario.telefone = agendamento.telefone;
  invalidarSessao();
  esquecerEscolha();
  mostrarSucesso(agendamento, config, aoFechar);
  return agendamento;
}
