// /agendar: o mesmo componente da página inicial, em tela cheia. Sem login, guarda a escolha e leva para entrar.
import { iniciarCasca, obterConfig } from './casca.js';
import { lerEscolhaGuardada, montarAgendamento } from './agendamento.js';
import { marcarComConfirmacao } from './confirmar.js';
import { h, icone } from './ui.js';

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
  async aoConfirmar({ servico, adicionais, inicio }) {
    if (!usuario) {
      location.href = `/entrar?volta=${encodeURIComponent('/agendar')}`;
      return;
    }
    const ag = await marcarComConfirmacao({
      servico, adicionais, inicio, usuario, config: await obterConfig(), aoFechar: () => { location.href = '/conta#horarios'; },
    });
    if (ag) $('[data-agendar-aviso]').hidden = true;
  },
});

if (!usuario) {
  $('[data-agendar-sub]').textContent = 'Escolha à vontade. Na hora de confirmar, é só entrar ou criar sua conta: o horário fica guardado.';
}
