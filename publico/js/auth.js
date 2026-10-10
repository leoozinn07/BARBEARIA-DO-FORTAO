// Entrar, criar conta, esqueci a senha, redefinir senha e confirmar e-mail.
import { invalidarSessao, post } from './api.js';
import { iniciarCasca } from './casca.js';
import { lerEscolhaGuardada } from './agendamento.js';
import { destinoSeguro, h, icone, ligarVerSenha, limparErros, mostrarErros, ocupado } from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const { usuario } = await iniciarCasca();
const form = $('[data-form]');
const tipo = form?.dataset.form || 'verificar';
const parametros = new URLSearchParams(location.search);

// Quem tem um horário guardado volta para confirmar; o resto vai para a conta (ou para o painel, se for o Fortão)
function destino(u) {
  const padrao = lerEscolhaGuardada()?.inicio ? '/agendar' : u?.papel === 'admin' ? '/admin' : '/conta';
  return destinoSeguro(padrao);
}

// Mantém o ?volta= ao trocar entre "Entrar" e "Criar conta"
document.querySelectorAll('[data-manter-volta]').forEach((a) => {
  const v = parametros.get('volta');
  if (v) a.href = `${a.getAttribute('href')}?volta=${encodeURIComponent(v)}`;
});

if (usuario && (tipo === 'entrar' || tipo === 'cadastro')) location.replace(destino(usuario));

ligarVerSenha();

// Medidor simples de força: comprimento e variedade. A regra de verdade fica no servidor.
const medidor = $('[data-forca]');
const campoSenha = form?.elements.namedItem('senha');
if (medidor && campoSenha) {
  campoSenha.addEventListener('input', () => {
    const s = campoSenha.value;
    let nivel = 0;
    if (s.length >= 8) nivel++;
    if (s.length >= 12) nivel++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) nivel++;
    if (/\d/.test(s) && /[^\w\s]/.test(s)) nivel++;
    medidor.dataset.nivel = String(Math.min(4, s ? Math.max(1, nivel) : 0));
  });
}

const valores = () => Object.fromEntries(new FormData(form).entries());

async function enviar(fn) {
  const botao = form.querySelector('[type="submit"]');
  limparErros(form);
  ocupado(botao, true);
  try {
    await fn();
  } catch (e) {
    mostrarErros(form, e);
  } finally {
    ocupado(botao, false);
  }
}

form?.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = valores();

  if (tipo === 'entrar') {
    enviar(async () => {
      const { usuario: u } = await post('/auth/entrar', { email: v.email, senha: v.senha });
      invalidarSessao();
      location.replace(destino(u));
    });
  }

  if (tipo === 'cadastro') {
    enviar(async () => {
      const { usuario: u } = await post('/auth/cadastro', {
        nome: v.nome,
        email: v.email,
        telefone: v.telefone || null,
        senha: v.senha,
        aceite: form.elements.namedItem('aceite').checked,
        marketing: form.elements.namedItem('marketing').checked,
      });
      invalidarSessao();
      location.replace(destino(u));
    });
  }

  if (tipo === 'recuperar') {
    enviar(async () => {
      const { mensagem } = await post('/auth/esqueci-senha', { email: v.email });
      $('[data-resultado-texto]').textContent = mensagem;
      $('[data-resultado]').hidden = false;
      form.hidden = true;
    });
  }

  if (tipo === 'redefinir') {
    enviar(async () => {
      if (v.senha !== v.confirmar) {
        mostrarErros(form, { campos: { confirmar: 'As senhas não são iguais.' } });
        return;
      }
      const token = parametros.get('token');
      if (!token) throw Object.assign(new Error('Link incompleto. Abra o link do e-mail de novo.'), { campos: {} });
      const { usuario: u } = await post('/auth/redefinir-senha', { token, senha: v.senha });
      invalidarSessao();
      location.replace(u?.papel === 'admin' ? '/admin' : '/conta');
    });
  }
});

// Confirmar e-mail: dispara sozinho ao abrir o link
if (tipo === 'verificar') {
  const caixa = $('[data-verificacao]');
  const token = parametros.get('token');
  const mostrar = (ok, texto) => {
    caixa.replaceChildren(
      h('p', { class: `alerta ${ok ? 'alerta--ok' : 'alerta--erro'}` }, icone(ok ? 'check-circle' : 'warning-circle', 'ph-fill'), h('span', {}, texto)),
      h('a', { class: 'botao botao--cheio', href: usuario ? '/agendar' : '/entrar' }, usuario ? 'Marcar horário' : 'Entrar'),
    );
  };
  if (!token) {
    mostrar(false, 'Link incompleto. Abra o link do e-mail de novo.');
  } else {
    post('/auth/verificar-email', { token })
      .then(() => mostrar(true, 'E-mail confirmado. Agora as confirmações e os lembretes chegam certinho.'))
      .catch((e) => mostrar(false, e.message));
  }
}
