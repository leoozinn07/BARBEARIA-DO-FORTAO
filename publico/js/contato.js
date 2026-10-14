// Painel: o Fortão fala com o cliente pelo próprio WhatsApp (link wa.me com a mensagem pronta, sem robô e sem custo)
// e salva o número na agenda do celular (arquivo de contato .vcf).
import { abrirFolha, h, icone, primeiroNome, quando, telefoneBonito } from './ui.js';

const digitos = (t) => String(t || '').replace(/\D/g, '');
/** Número no formato internacional, só dígitos: 5511912345678. */
export const numeroInternacional = (t) => {
  const d = digitos(t);
  return d.length >= 12 && d.startsWith('55') ? d : `55${d}`;
};
export const linkWhatsapp = (telefone, texto = '') => `https://wa.me/${numeroInternacional(telefone)}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

// ---------------------------------------------------------------- salvar contato
const escaparVcard = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Baixa o contato (.vcf). No celular, abrir o arquivo leva direto para "Criar contato". */
export function salvarContato({ nome, telefone, email }) {
  const linhas = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:;${escaparVcard(nome)};;;`,
    `FN:${escaparVcard(nome)}`,
    `TEL;TYPE=CELL:+${numeroInternacional(telefone)}`,
    email ? `EMAIL:${escaparVcard(email)}` : null,
    'NOTE:Cliente da Barbearia do Fortão',
    'END:VCARD',
  ].filter(Boolean);
  const url = URL.createObjectURL(new Blob([`${linhas.join('\r\n')}\r\n`], { type: 'text/vcard;charset=utf-8' }));
  const arquivo = `${String(nome || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'cliente'}.vcf`;
  const a = h('a', { href: url, download: arquivo, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------------------------------------------------------------- mensagens prontas
function modelos({ nome, ag, site }) {
  const oi = `Fala, ${primeiroNome(nome) || 'tudo certo'}! Aqui é o Fortão, da Barbearia do Fortão.`;
  if (!ag) {
    return [
      { id: 'oi', rotulo: 'Oi', texto: `${oi} ` },
      { id: 'saudade', rotulo: 'Faz tempo', texto: `${oi} Faz um tempo que você não passa aqui. Bora ficar na régua? Marca seu horário pelo site: ${site}` },
    ];
  }
  const horario = `${ag.servico}, ${quando(ag.inicio)}`;
  return [
    { id: 'lembrete', rotulo: 'Lembrete', texto: `${oi} Passando para lembrar do seu horário: ${horario}. Te espero!` },
    { id: 'confirmar', rotulo: 'Confirmar presença', texto: `${oi} Seu horário é ${horario}. Consegue vir? Me responde aqui para eu confirmar.` },
    { id: 'remarcado', rotulo: 'Remarcado', texto: `${oi} Seu horário mudou para ${horario}. Qualquer coisa, me chama aqui.` },
    { id: 'cancelado', rotulo: 'Cancelado', texto: `${oi} Precisei cancelar seu horário de ${quando(ag.inicio)}. Desculpa! Quando quiser, marca de novo pelo site: ${site}` },
    { id: 'livre', rotulo: 'Escrever', texto: `${oi} ` },
  ];
}

/**
 * Folha "Mensagem no WhatsApp": escolhe um modelo, ajusta o texto e abre o WhatsApp do Fortão já na conversa.
 * ag é opcional (sem ele, mensagens para o cliente em geral). modelo escolhe o texto inicial.
 */
export function abrirMensagem({ nome, telefone, email = null, ag = null, modelo = null }) {
  const lista = modelos({ nome, ag, site: location.origin });
  const inicial = lista.find((m) => m.id === modelo) ?? lista[0];
  const texto = h('textarea', { id: 'msg-texto', name: 'texto', rows: 5, maxlength: 1000 });
  texto.value = inicial.texto;
  const abrir = h('a', { class: 'botao botao--cheio botao--bloco', target: '_blank', rel: 'noopener' }, icone('whatsapp-logo'), 'Abrir no WhatsApp');
  const atualizar = () => { abrir.href = linkWhatsapp(telefone, texto.value.trim()); };
  texto.addEventListener('input', atualizar);
  atualizar();

  const escolhas = h('fieldset', { class: 'modelos-msg' }, h('legend', { class: 'rotulo-campo' }, 'Mensagem pronta'),
    ...lista.map((m) => h('label', {},
      h('input', { type: 'radio', name: 'modelo', value: m.id, checked: m === inicial, onchange: () => { texto.value = m.texto; atualizar(); } }),
      h('span', {}, m.rotulo))));

  const d = h('dialog', { class: 'folha', 'aria-labelledby': 'msg-titulo' },
    h('div', { class: 'folha__alca', 'aria-hidden': 'true' }),
    h('div', { class: 'folha__corpo' },
      h('div', { class: 'folha__topo' },
        h('h2', { id: 'msg-titulo' }, `Mensagem para ${primeiroNome(nome) || 'o cliente'}`),
        h('button', { class: 'icone-botao', type: 'button', 'aria-label': 'Fechar', onclick: () => d.close() }, icone('x'))),
      h('p', { class: 'subtitulo' }, `${nome} · ${telefoneBonito(digitos(telefone).replace(/^55(?=\d{10,11}$)/, ''))}`),
      escolhas,
      h('div', { class: 'campo' }, h('label', { for: 'msg-texto' }, 'Texto (dá para mudar)'), texto),
      abrir,
      h('button', { class: 'botao botao--suave botao--bloco', type: 'button', onclick: () => salvarContato({ nome, telefone, email }) }, icone('address-book'), 'Salvar contato no celular'),
      h('p', { class: 'msg-nota' }, 'A mensagem sai do seu WhatsApp, como uma conversa normal. Nada é enviado sozinho.'),
    ));
  document.body.append(d);
  d.addEventListener('close', () => setTimeout(() => d.remove(), 400), { once: true });
  abrir.addEventListener('click', () => setTimeout(() => d.close(), 300));
  abrirFolha(d);
}
