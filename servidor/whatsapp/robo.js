// Robô do WhatsApp: responde o cliente que escreve para o número da barbearia.
// "1" confirma presença, "2" cancela (dentro do prazo), qualquer outra coisa recebe o resumo do próximo horário.
import { consulta } from '../db/index.js';
import { ErroApp } from '../lib/erros.js';
import { log } from '../lib/log.js';
import { descreverDataHora } from '../lib/tempo.js';
import { cancelarAgendamento } from '../servicos/agenda.js';
import { lerConfiguracoes } from '../servicos/configuracoes.js';
import { acordarWhatsapp, chaveTelefone, enfileirarWhatsapp } from './fila.js';
import { robo } from './mensagens.js';

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O que o cliente quis dizer. Aceita o número, a palavra e o texto dos botões dos modelos. */
export function entender(texto) {
  const t = semAcento(texto);
  if (/^(1|sim|confirm|vou|estarei|ok\b|beleza|fechado)/.test(t)) return 'confirmar';
  if (/^(2|cancel|desmarc|nao vou|nao posso|nao vai dar)/.test(t)) return 'cancelar';
  return 'menu';
}

/** Próximo horário confirmado deste telefone, com lembrete pelo WhatsApp ligado. */
async function proximoHorario(de) {
  const chave = chaveTelefone(de);
  if (!chave) return null;
  const candidatos = await consulta(
    `SELECT id, codigo, servico_nome, inicio, cliente_telefone FROM agendamentos
      WHERE status = 'confirmado' AND whatsapp_lembrete = 1 AND inicio > UTC_TIMESTAMP() AND cliente_telefone LIKE ?
      ORDER BY inicio LIMIT 10`,
    [`%${chave.slice(-8)}`],
  );
  return candidatos.find((c) => chaveTelefone(c.cliente_telefone) === chave) || null;
}

async function responder(para, texto) {
  await enfileirarWhatsapp(null, { para, texto });
  acordarWhatsapp();
}

/** Trata uma mensagem recebida. A Meta pode mandar a mesma mais de uma vez: cada id só é tratado uma vez. */
export async function tratarMensagem({ id, de, texto }) {
  const nova = await consulta('INSERT IGNORE INTO whatsapp_recebidas (mensagem_id, de) VALUES (?, ?)', [String(id).slice(0, 128), String(de).slice(0, 20)]);
  if (nova.affectedRows !== 1) return 'repetida';

  const ag = await proximoHorario(de);
  if (!ag) {
    await responder(de, robo.semHorario());
    return 'sem_horario';
  }
  const dados = { servico: ag.servico_nome, quando: descreverDataHora(new Date(ag.inicio)) };
  const intencao = entender(texto);

  if (intencao === 'confirmar') {
    await consulta('UPDATE agendamentos SET presenca_confirmada_em = UTC_TIMESTAMP() WHERE id = ? AND status = ?', [ag.id, 'confirmado']);
    await responder(de, robo.presencaConfirmada(dados));
    return 'confirmado';
  }
  if (intencao === 'cancelar') {
    try {
      await cancelarAgendamento({ codigo: ag.codigo, peloWhatsapp: true, motivo: 'Cancelado pelo cliente no WhatsApp' });
      await responder(de, robo.cancelado(dados));
      return 'cancelado';
    } catch (e) {
      if (!(e instanceof ErroApp)) throw e;
      const { agenda } = await lerConfiguracoes();
      await responder(de, robo.foraDoPrazo({ horas: agenda.cancelar_ate_horas }));
      log.info('whatsapp_cancelar_recusado', { codigo: ag.codigo, motivo: e.codigo });
      return 'fora_do_prazo';
    }
  }
  await responder(de, robo.menu(dados));
  return 'menu';
}
