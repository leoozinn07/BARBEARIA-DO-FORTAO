// Lembrete do horário: arquivo de agenda (.ics, abre no app de agenda do celular), Google Agenda e o aviso do e-mail.
import { h, icone } from './ui.js';

const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function endereco(config) {
  const n = config?.negocio;
  return n ? [n.endereco, n.bairro, `${n.cidade} - ${n.uf}`].filter(Boolean).join(', ') : 'Cohab 5, São Paulo - SP';
}

/** Link para baixar o .ics, com alarme 1 h antes. */
export function linkAgendaCelular(ag, config) {
  const texto = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Barbearia do Fortao//PT-BR', 'BEGIN:VEVENT',
    `UID:${ag.codigo}@barbearia-do-fortao`, `DTSTAMP:${utc(new Date().toISOString())}`, `DTSTART:${utc(ag.inicio)}`, `DTEND:${utc(ag.fim)}`,
    `SUMMARY:${ag.servico} na Barbearia do Fortão`, `LOCATION:${endereco(config).replace(/[,;]/g, (c) => `\\${c}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Corte na Barbearia do Fortão', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return URL.createObjectURL(new Blob([texto], { type: 'text/calendar' }));
}

export function linkGoogleAgenda(ag, config) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${ag.servico} na Barbearia do Fortão`,
    dates: `${utc(ag.inicio)}/${utc(ag.fim)}`,
    details: `Código ${ag.codigo}. Pagamento na barbearia.`,
    location: endereco(config),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Botões de lembrete + linha do e-mail, prontos para colocar numa folha ou num cartão. */
export function acoesLembrete(ag, config, email) {
  return h('div', { class: 'lembrete' },
    h('div', { class: 'lembrete__botoes' },
      h('a', { class: 'botao botao--suave', href: linkAgendaCelular(ag, config), download: `fortao-${ag.codigo}.ics` }, icone('calendar-plus'), 'Agenda do celular'),
      h('a', { class: 'botao botao--suave', href: linkGoogleAgenda(ag, config), target: '_blank', rel: 'noopener' }, icone('google-logo'), 'Google Agenda'),
    ),
    h('p', { class: 'lembrete__aviso' }, icone('envelope-simple'),
      h('span', {}, 'Lembrete por e-mail', email ? [' em ', h('b', {}, email)] : '', ': 1 dia antes e 2 horas antes.')),
  );
}
