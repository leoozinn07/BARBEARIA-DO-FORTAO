// /agendar: o mesmo componente da página inicial, em tela cheia. Sem login, guarda a escolha e leva para entrar.
import { post } from './api.js';
import { iniciarCasca } from './casca.js';
import { esquecerEscolha, lerEscolhaGuardada, montarAgendamento } from './agendamento.js';
import { abrirFolha, h, icone, quando, reais } from './ui.js';

const $ = (s) => document.querySelector(s);
const { usuario } = await iniciarCasca();
const escolha = lerEscolhaGuardada();

if (usuario && escolha?.inicio) {
  const aviso = $('[data-agendar-aviso]');
  aviso.replaceChildren(icone('info'), h('span', {}, 'Guardamos o horário que você escolheu. Confira e toque em "Marcar horário" para confirmar.'));
  aviso.hidden = false;
}

montarAgendamento($('[data-agendamento]'), {
  inicial: escolha || {},
  async aoConfirmar({ servico, inicio }) {
    if (!usuario) {
      location.href = `/entrar?volta=${encodeURIComponent('/agendar')}`;
      return;
    }
    const { agendamento } = await post('/agendamentos', { servico: servico.slug, inicio });
    esquecerEscolha();
    $('[data-agendar-aviso]').hidden = true;
    $('[data-sucesso-texto]').textContent = `${agendamento.servico}, ${quando(agendamento.inicio)}. Valor: ${reais(agendamento.preco_centavos)}, pago na barbearia.`;
    const folha = $('[data-folha-sucesso]');
    abrirFolha(folha);
    folha.addEventListener('close', () => { location.href = '/conta#horarios'; }, { once: true });
  },
});

if (!usuario) {
  $('[data-agendar-sub]').textContent = 'Escolha à vontade. Na hora de confirmar, é só entrar ou criar sua conta: o horário fica guardado.';
}
