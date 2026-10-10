// Modelos de e-mail (HTML compatível com Gmail/Outlook + versão texto). Tudo escapado.
import { config } from '../config.js';
import { paraIcs } from '../lib/tempo.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const FRASES = ['Constância vence talento.', 'Cabelo na régua, mente no lugar.', 'Disciplina é o meu superpoder.', 'Corre pelo seu.'];
const frase = () => FRASES[new Date().getDate() % FRASES.length];

function botao(texto, link) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:999px;background:#111112">
    <a href="${esc(link)}" style="display:inline-block;padding:14px 26px;font:600 15px Arial,Helvetica,sans-serif;color:#f2f2f3;text-decoration:none;border-radius:999px">${esc(texto)}</a>
  </td></tr></table>`;
}

function detalhes(linhas) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0;border-collapse:collapse">
    ${linhas.map(([rotulo, valor]) => `<tr>
      <td style="padding:10px 0;border-top:1px solid #e4e4e6;font:14px Arial,Helvetica,sans-serif;color:#66666d;width:38%">${esc(rotulo)}</td>
      <td style="padding:10px 0;border-top:1px solid #e4e4e6;font:600 15px Arial,Helvetica,sans-serif;color:#111112">${esc(valor)}</td>
    </tr>`).join('')}
  </table>`;
}

function layout({ titulo, previa, corpo, endereco = '' }) {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#ececee">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(previa)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ececee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="background:#0b0b0c;border-radius:20px 20px 0 0;padding:22px 28px">
      <img src="${esc(config.appUrl)}/img/email-logo.png" width="190" height="48" alt="Barbearia do Fortão" style="display:block;border:0">
    </td></tr>
    <tr><td style="background:#ffffff;padding:32px 28px 28px;border-radius:0 0 20px 20px">
      <h1 style="margin:0 0 14px;font:700 24px/1.2 Arial,Helvetica,sans-serif;color:#111112;letter-spacing:-0.3px">${esc(titulo)}</h1>
      ${corpo}
    </td></tr>
    <tr><td style="padding:22px 12px 8px;text-align:center;font:13px/1.5 Arial,Helvetica,sans-serif;color:#66666d">
      <strong style="color:#111112">${esc(frase())}</strong><br>
      Barbearia do Fortão${endereco ? `<br>${esc(endereco)}` : ''}<br>
      <a href="${esc(config.appUrl)}/privacidade" style="color:#66666d">Privacidade</a> &nbsp;·&nbsp; <a href="${esc(config.appUrl)}/conta" style="color:#66666d">Minha conta</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  return html;
}

const p = (texto) => `<p style="margin:0 0 12px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#2b2b30">${texto}</p>`;
const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'cliente';

// ---------------------------------------------------------------------------

export function verificarEmail({ nome, link }) {
  const titulo = 'Confirme seu e-mail';
  return {
    assunto: 'Confirme seu e-mail na Barbearia do Fortão',
    html: layout({ titulo, previa: 'Falta um toque para confirmar sua conta.', corpo:
      p(`Fala, ${esc(primeiroNome(nome))}! Sua conta foi criada.`) +
      p('Confirme o e-mail para receber as confirmações e os lembretes dos seus horários.') +
      botao('Confirmar e-mail', link) +
      p('<span style="font-size:13px;color:#66666d">O link vale por 48 horas. Se você não criou esta conta, ignore este e-mail.</span>') }),
    texto: `Fala, ${primeiroNome(nome)}! Confirme seu e-mail para receber confirmações e lembretes:\n${link}\n\nO link vale por 48 horas.`,
  };
}

export function redefinirSenha({ nome, link }) {
  return {
    assunto: 'Redefinir sua senha',
    html: layout({ titulo: 'Redefinir sua senha', previa: 'Link para criar uma senha nova.', corpo:
      p(`Oi, ${esc(primeiroNome(nome))}. Recebemos um pedido para trocar a senha da sua conta.`) +
      botao('Criar senha nova', link) +
      p('<span style="font-size:13px;color:#66666d">O link vale por 1 hora e só funciona uma vez. Se não foi você, ignore: sua senha continua a mesma.</span>') }),
    texto: `Oi, ${primeiroNome(nome)}. Para criar uma senha nova, acesse (vale 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.`,
  };
}

export function senhaAlterada({ nome }) {
  return {
    assunto: 'Sua senha foi alterada',
    html: layout({ titulo: 'Sua senha foi alterada', previa: 'Aviso de segurança da sua conta.', corpo:
      p(`Oi, ${esc(primeiroNome(nome))}. A senha da sua conta acabou de ser alterada e as outras sessões foram encerradas.`) +
      p('Se não foi você, redefina a senha agora e fale com a barbearia.') +
      botao('Redefinir senha', `${config.appUrl}/recuperar-senha`) }),
    texto: `Oi, ${primeiroNome(nome)}. A senha da sua conta foi alterada. Se não foi você, redefina em ${config.appUrl}/recuperar-senha`,
  };
}

export function agendamentoConfirmado({ nome, servico, quando, valor, endereco, codigo }) {
  return {
    assunto: `Horário confirmado: ${quando}`,
    html: layout({ titulo: 'Horário confirmado', previa: `${servico}, ${quando}.`, endereco, corpo:
      p(`Fechou, ${esc(primeiroNome(nome))}! Seu horário está garantido.`) +
      detalhes([['Serviço', servico], ['Quando', quando], ['Valor', `${valor} (pago na barbearia)`], ['Onde', endereco || 'Cohab 5, São Paulo - SP'], ['Código', codigo]]) +
      p('Vamos te lembrar 24 horas e 2 horas antes. O convite em anexo coloca o horário na sua agenda do celular.') +
      botao('Ver meus horários', `${config.appUrl}/conta`) }),
    texto: `Horário confirmado!\n${servico}\n${quando}\nValor: ${valor} (pago na barbearia)\nOnde: ${endereco}\nCódigo: ${codigo}\n\nVer meus horários: ${config.appUrl}/conta`,
  };
}

export function agendamentoRemarcado({ nome, servico, quando, anterior, endereco, codigo }) {
  return {
    assunto: `Horário remarcado: ${quando}`,
    html: layout({ titulo: 'Horário remarcado', previa: `Novo horário: ${quando}.`, endereco, corpo:
      p(`Pronto, ${esc(primeiroNome(nome))}. Seu horário mudou.`) +
      detalhes([['Serviço', servico], ['Novo horário', quando], ['Antes era', anterior], ['Código', codigo]]) +
      botao('Ver meus horários', `${config.appUrl}/conta`) }),
    texto: `Horário remarcado.\n${servico}\nNovo horário: ${quando}\nAntes era: ${anterior}\nCódigo: ${codigo}`,
  };
}

export function agendamentoCancelado({ nome, servico, quando, motivo, porAdmin }) {
  const frasePor = porAdmin ? 'A barbearia precisou cancelar o seu horário.' : 'Seu horário foi cancelado, como você pediu.';
  return {
    assunto: `Horário cancelado: ${quando}`,
    html: layout({ titulo: 'Horário cancelado', previa: `${servico}, ${quando}.`, corpo:
      p(`Oi, ${esc(primeiroNome(nome))}. ${frasePor}`) +
      detalhes([['Serviço', servico], ['Era', quando], ...(motivo ? [['Motivo', motivo]] : [])]) +
      p('Quando quiser, é só marcar de novo.') +
      botao('Marcar outro horário', `${config.appUrl}/agendar`) }),
    texto: `${frasePor}\n${servico}\nEra: ${quando}${motivo ? `\nMotivo: ${motivo}` : ''}\n\nMarcar outro horário: ${config.appUrl}/agendar`,
  };
}

export function lembrete({ nome, servico, quando, endereco, tipo, codigo }) {
  const chamada = tipo === '2h' ? 'Daqui a pouco é a sua vez' : 'Amanhã tem corte';
  return {
    assunto: `${chamada}: ${quando}`,
    html: layout({ titulo: chamada, previa: `${servico}, ${quando}.`, endereco, corpo:
      p(`${esc(primeiroNome(nome))}, passando para lembrar do seu horário.`) +
      detalhes([['Serviço', servico], ['Quando', quando], ['Onde', endereco || 'Cohab 5, São Paulo - SP'], ['Código', codigo]]) +
      p('Não vai dar? Cancele ou remarque pelo app para liberar a cadeira para outra pessoa.') +
      botao('Ver meu horário', `${config.appUrl}/conta`) }),
    texto: `${chamada}!\n${servico}\n${quando}\nOnde: ${endereco}\nCódigo: ${codigo}\n\nNão vai dar? Cancele ou remarque: ${config.appUrl}/conta`,
  };
}

export function adminNovoAgendamento({ cliente, telefone, servico, quando, valor, codigo }) {
  return {
    assunto: `Novo horário: ${cliente}, ${quando}`,
    html: layout({ titulo: 'Novo horário marcado', previa: `${cliente}, ${servico}, ${quando}.`, corpo:
      detalhes([['Cliente', cliente], ['Telefone', telefone || 'Não informado'], ['Serviço', servico], ['Quando', quando], ['Valor', valor], ['Código', codigo]]) +
      botao('Abrir o painel', `${config.appUrl}/admin`) }),
    texto: `Novo horário marcado\nCliente: ${cliente}\nTelefone: ${telefone || 'não informado'}\n${servico}\n${quando}\n${valor}\nCódigo: ${codigo}`,
  };
}

export function adminCancelamento({ cliente, servico, quando, codigo }) {
  return {
    assunto: `Cancelado: ${cliente}, ${quando}`,
    html: layout({ titulo: 'Cliente cancelou', previa: `${cliente} liberou ${quando}.`, corpo:
      p('O horário abaixo ficou livre de novo.') +
      detalhes([['Cliente', cliente], ['Serviço', servico], ['Era', quando], ['Código', codigo]]) +
      botao('Abrir o painel', `${config.appUrl}/admin`) }),
    texto: `Cliente cancelou\n${cliente}\n${servico}\nEra: ${quando}\nCódigo: ${codigo}`,
  };
}

export function contaExcluida({ nome }) {
  return {
    assunto: 'Sua conta foi excluída',
    html: layout({ titulo: 'Conta excluída', previa: 'Seus dados pessoais foram apagados.', corpo:
      p(`${esc(primeiroNome(nome))}, sua conta foi excluída e seus dados pessoais foram apagados, como manda a LGPD.`) +
      p('Horários futuros foram cancelados. Se quiser voltar, é só criar uma conta nova.') }),
    texto: `${primeiroNome(nome)}, sua conta foi excluída e seus dados pessoais foram apagados. Horários futuros foram cancelados.`,
  };
}

/** Convite de calendário (.ics) com alarme 1 hora antes. */
export function convite({ codigo, servico, inicio, fim, endereco }) {
  const limpar = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Barbearia do Fortao//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${codigo}@barbearia-do-fortao`,
    `DTSTAMP:${paraIcs(new Date())}`,
    `DTSTART:${paraIcs(inicio)}`,
    `DTEND:${paraIcs(fim)}`,
    `SUMMARY:${limpar(`${servico} na Barbearia do Fortão`)}`,
    `LOCATION:${limpar(endereco || 'Cohab 5, São Paulo - SP')}`,
    `DESCRIPTION:${limpar(`Código ${codigo}. Cancele ou remarque em ${config.appUrl}/conta`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Corte na Barbearia do Fortão', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return { filename: `fortao-${codigo}.ics`, contentType: 'text/calendar; charset=utf-8; method=PUBLISH', content: linhas.join('\r\n') + '\r\n' };
}
