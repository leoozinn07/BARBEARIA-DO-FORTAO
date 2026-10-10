// Datas: o banco guarda UTC; a barbearia funciona no horário de São Paulo.
// Tudo passa por Intl com o fuso America/Sao_Paulo, então uma volta do horário de verão não quebra a agenda.
import { FUSO } from '../config.js';

const pad = (n) => String(n).padStart(2, '0');

const fmtPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export function partesLocais(data) {
  const p = Object.fromEntries(fmtPartes.formatToParts(data).map((x) => [x.type, x.value]));
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute, segundo: +p.second };
}

/** Diferença em minutos entre o horário local e UTC naquele instante (São Paulo hoje: -180). */
function deslocamentoMin(data) {
  const p = partesLocais(data);
  return (Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - data.getTime()) / 60000;
}

/** "2026-10-14" + 570 minutos (9h30 em SP) => Date em UTC */
export function localParaUtc(dataISO, minutosDoDia) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, 0, minutosDoDia);
  let utc = ingenuo - deslocamentoMin(new Date(ingenuo)) * 60000;
  const ajuste = deslocamentoMin(new Date(utc));
  utc = ingenuo - ajuste * 60000;
  return new Date(utc);
}

export function dataLocalISO(data) {
  const p = partesLocais(data);
  return `${p.ano}-${pad(p.mes)}-${pad(p.dia)}`;
}

export function minutosLocais(data) {
  const p = partesLocais(data);
  return p.hora * 60 + p.minuto;
}

export function diaSemana(dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function somarDias(dataISO, n) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

export const horaParaMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
export const minutosParaHora = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export const dataISOValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && somarDias(s, 0) === s;

/** Início e fim (UTC) do dia local, para buscar no banco. */
export function limitesDoDia(dataISO) {
  return { de: localParaUtc(dataISO, 0), ate: localParaUtc(somarDias(dataISO, 1), 0) };
}

const fmtLongo = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const fmtCurto = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });

/** "terça-feira, 14 de outubro às 09:30" */
export const descreverDataHora = (data) => `${fmtLongo.format(data)} às ${fmtHora.format(data)}`;
export const descreverHora = (data) => fmtHora.format(data);
export const descreverDiaCurto = (data) => fmtCurto.format(data);

/** Formato iCalendar em UTC: 20261014T123000Z */
export const paraIcs = (data) => data.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
