// Cada acontecimento da agenda vira: e-mail na fila + aviso no app (na mesma transação) + push (depois do commit).
import { config } from '../config.js';
import { consulta, umaLinha } from '../db/index.js';
import * as modelos from '../emails/modelos.js';
import { enfileirarEmail, acordarEntregador } from '../emails/fila.js';
import { log } from '../lib/log.js';
import { descreverDataHora, reais } from '../lib/tempo.js';
import { enderecoCompleto, lerConfiguracoes } from './configuracoes.js';
import { enviarPush } from './push.js';

export async function criarAviso(conn, { usuarioId, tipo, titulo, corpo, link = null }) {
  if (!usuarioId) return;
  await consulta('INSERT INTO notificacoes (usuario_id, tipo, titulo, corpo, link) VALUES (?, ?, ?, ?, ?)', [usuarioId, tipo, titulo, corpo, link], conn);
}

async function admins(conn) {
  return consulta("SELECT id, nome, email FROM usuarios WHERE papel = 'admin' AND excluido_em IS NULL", [], conn);
}

async function emailDoCliente(conn, clienteId) {
  if (!clienteId) return null;
  return umaLinha('SELECT nome, email FROM usuarios WHERE id = ? AND excluido_em IS NULL', [clienteId], conn);
}

/** Executa o que só pode rodar depois do commit (push e entrega imediata de e-mail). */
export function executarEfeitos(efeitos = []) {
  acordarEntregador();
  for (const e of efeitos) {
    enviarPush(e.usuarioIds, e.payload).catch((erro) => log.aviso('push_efeito', { erro: erro.message }));
  }
}

export async function aoAgendar(conn, ag) {
  const { negocio } = await lerConfiguracoes();
  const endereco = enderecoCompleto(negocio);
  const quando = descreverDataHora(ag.inicio);
  const valor = reais(ag.preco_centavos);
  const cliente = await emailDoCliente(conn, ag.cliente_id);
  if (cliente) {
    const m = modelos.agendamentoConfirmado({ nome: cliente.nome, servico: ag.servico_nome, quando, valor, endereco, codigo: ag.codigo });
    await enfileirarEmail(conn, { para: cliente.email, ...m, anexos: [modelos.convite({ codigo: ag.codigo, servico: ag.servico_nome, inicio: ag.inicio, fim: ag.fim, endereco })] });
    await criarAviso(conn, { usuarioId: ag.cliente_id, tipo: 'agendado', titulo: 'Horário confirmado', corpo: `${ag.servico_nome}, ${quando}.`, link: '/conta' });
  }
  // Quando o próprio Fortão marca pelo painel, ele não precisa ser avisado da própria ação
  if (ag.origem !== 'app') return [];
  const equipe = await admins(conn);
  const corpo = `${ag.cliente_nome}: ${ag.servico_nome}, ${quando}.`;
  for (const a of equipe) {
    await criarAviso(conn, { usuarioId: a.id, tipo: 'novo_agendamento', titulo: 'Novo horário marcado', corpo, link: '/admin' });
  }
  const m = modelos.adminNovoAgendamento({ cliente: ag.cliente_nome, telefone: ag.cliente_telefone, servico: ag.servico_nome, quando, valor, codigo: ag.codigo });
  for (const para of new Set([config.email.admin, ...equipe.map((a) => a.email)].filter(Boolean))) await enfileirarEmail(conn, { para, ...m });
  return [{ usuarioIds: equipe.map((a) => a.id), payload: { titulo: 'Novo horário marcado', corpo, link: '/admin', tag: `ag-${ag.codigo}` } }];
}

export async function aoRemarcar(conn, ag, inicioAnterior) {
  const { negocio } = await lerConfiguracoes();
  const endereco = enderecoCompleto(negocio);
  const quando = descreverDataHora(ag.inicio);
  const anterior = descreverDataHora(inicioAnterior);
  const cliente = await emailDoCliente(conn, ag.cliente_id);
  if (cliente) {
    const m = modelos.agendamentoRemarcado({ nome: cliente.nome, servico: ag.servico_nome, quando, anterior, endereco, codigo: ag.codigo });
    await enfileirarEmail(conn, { para: cliente.email, ...m, anexos: [modelos.convite({ codigo: ag.codigo, servico: ag.servico_nome, inicio: ag.inicio, fim: ag.fim, endereco })] });
    await criarAviso(conn, { usuarioId: ag.cliente_id, tipo: 'remarcado', titulo: 'Horário remarcado', corpo: `${ag.servico_nome}, agora ${quando}.`, link: '/conta' });
  }
  const equipe = await admins(conn);
  const corpo = `${ag.cliente_nome} mudou para ${quando} (antes: ${anterior}).`;
  for (const a of equipe) await criarAviso(conn, { usuarioId: a.id, tipo: 'remarcado', titulo: 'Cliente remarcou', corpo, link: '/admin' });
  return [{ usuarioIds: equipe.map((a) => a.id), payload: { titulo: 'Cliente remarcou', corpo, link: '/admin', tag: `ag-${ag.codigo}` } }];
}

export async function aoCancelar(conn, ag, { porAdmin, motivo }) {
  const quando = descreverDataHora(ag.inicio);
  const cliente = await emailDoCliente(conn, ag.cliente_id);
  const efeitos = [];
  if (cliente) {
    const m = modelos.agendamentoCancelado({ nome: cliente.nome, servico: ag.servico_nome, quando, motivo, porAdmin });
    await enfileirarEmail(conn, { para: cliente.email, ...m });
    const titulo = porAdmin ? 'A barbearia cancelou seu horário' : 'Horário cancelado';
    const corpo = `${ag.servico_nome}, ${quando}.${motivo ? ` Motivo: ${motivo}` : ''}`;
    await criarAviso(conn, { usuarioId: ag.cliente_id, tipo: 'cancelado', titulo, corpo, link: '/conta' });
    if (porAdmin) efeitos.push({ usuarioIds: [ag.cliente_id], payload: { titulo, corpo, link: '/conta', tag: `ag-${ag.codigo}` } });
  }
  if (!porAdmin) {
    const equipe = await admins(conn);
    const corpo = `${ag.cliente_nome} cancelou ${quando}. O horário ficou livre.`;
    for (const a of equipe) await criarAviso(conn, { usuarioId: a.id, tipo: 'cancelado', titulo: 'Cliente cancelou', corpo, link: '/admin' });
    const m = modelos.adminCancelamento({ cliente: ag.cliente_nome, servico: ag.servico_nome, quando, codigo: ag.codigo });
    for (const para of new Set([config.email.admin, ...equipe.map((a) => a.email)].filter(Boolean))) await enfileirarEmail(conn, { para, ...m });
    efeitos.push({ usuarioIds: equipe.map((a) => a.id), payload: { titulo: 'Cliente cancelou', corpo, link: '/admin', tag: `ag-${ag.codigo}` } });
  }
  return efeitos;
}

export async function aoLembrar(conn, ag, tipo) {
  const cliente = await emailDoCliente(conn, ag.cliente_id);
  if (!cliente) return [];
  const { negocio } = await lerConfiguracoes();
  const quando = descreverDataHora(ag.inicio);
  const m = modelos.lembrete({ nome: cliente.nome, servico: ag.servico_nome, quando, endereco: enderecoCompleto(negocio), tipo, codigo: ag.codigo });
  await enfileirarEmail(conn, { para: cliente.email, ...m });
  const titulo = tipo === '2h' ? 'Daqui a pouco é a sua vez' : 'Amanhã tem corte';
  const corpo = `${ag.servico_nome}, ${quando}.`;
  await criarAviso(conn, { usuarioId: ag.cliente_id, tipo: `lembrete_${tipo}`, titulo, corpo, link: '/conta' });
  return [{ usuarioIds: [ag.cliente_id], payload: { titulo, corpo, link: '/conta', tag: `lembrete-${ag.codigo}` } }];
}
