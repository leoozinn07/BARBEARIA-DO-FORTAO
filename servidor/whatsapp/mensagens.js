// Textos do WhatsApp. Mensagem que a barbearia manda primeiro usa um modelo aprovado na Meta:
// os parâmetros entram no lugar de {{1}}, {{2}}... na mesma ordem (textos dos modelos em docs/whatsapp.md).
import { config } from '../config.js';

const RESPONDA = 'Responda 1 para confirmar presença ou 2 para cancelar.';

export function confirmacao({ nome, servico, quando, valor }) {
  return {
    modelo: config.whatsapp.modelos.confirmacao,
    parametros: [nome, servico, quando, valor],
    texto: `Fala, ${nome}! Seu horário na Barbearia do Fortão está confirmado: ${servico}, ${quando}. Valor: ${valor}, pago na barbearia. ${RESPONDA}`,
  };
}

export function lembrete({ nome, servico, quando }) {
  return {
    modelo: config.whatsapp.modelos.lembrete,
    parametros: [nome, servico, quando],
    texto: `${nome}, passando para lembrar do seu horário na Barbearia do Fortão: ${servico}, ${quando}. ${RESPONDA}`,
  };
}

export function remarcado({ nome, servico, quando }) {
  return {
    modelo: config.whatsapp.modelos.remarcado,
    parametros: [nome, servico, quando],
    texto: `${nome}, seu horário na Barbearia do Fortão mudou: ${servico}, ${quando}. ${RESPONDA}`,
  };
}

export function cancelado({ nome, servico, quando }) {
  return {
    modelo: config.whatsapp.modelos.cancelado,
    parametros: [nome, servico, quando],
    texto: `${nome}, seu horário na Barbearia do Fortão (${servico}, ${quando}) foi cancelado. Quando quiser, é só marcar de novo pelo site.`,
  };
}

// ---------------------------------------------------------------- respostas do robô (texto livre)
export const robo = {
  presencaConfirmada: ({ servico, quando }) => `Presença confirmada! Te esperamos: ${servico}, ${quando}. Até lá!`,
  cancelado: ({ servico, quando }) => `Pronto, cancelei: ${servico}, ${quando}. O horário ficou livre. Para marcar de novo: ${config.appUrl}/agendar`,
  foraDoPrazo: ({ horas }) => `Faltam menos de ${horas} h para o seu horário, então não dá para cancelar por aqui. Se não puder vir, avise a barbearia o quanto antes.`,
  semHorario: () => `Oi! Aqui é o assistente da Barbearia do Fortão. Você não tem horário marcado agora. Para marcar: ${config.appUrl}/agendar`,
  menu: ({ servico, quando }) => `Oi! Aqui é o assistente da Barbearia do Fortão. Seu próximo horário: ${servico}, ${quando}. ${RESPONDA} Para remarcar: ${config.appUrl}/conta`,
};
