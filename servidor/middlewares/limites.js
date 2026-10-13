// Limite de pedidos por IP nos pontos sensíveis (força bruta, spam de cadastro e de agendamento).
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

function limitador({ janelaMin, max, mensagem }) {
  return rateLimit({
    windowMs: janelaMin * 60000,
    limit: () => (config.limitesDesligados ? 1_000_000 : max),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ erro: mensagem, codigo: 'limite' }),
  });
}

export const limites = {
  api: limitador({ janelaMin: 15, max: 600, mensagem: 'Muitos pedidos em pouco tempo. Espere um pouco.' }),
  entrar: limitador({ janelaMin: 15, max: 10, mensagem: 'Muitas tentativas de entrar. Espere 15 minutos.' }),
  cadastro: limitador({ janelaMin: 60, max: 8, mensagem: 'Muitos cadastros deste aparelho. Tente mais tarde.' }),
  senha: limitador({ janelaMin: 60, max: 6, mensagem: 'Muitos pedidos de senha. Tente mais tarde.' }),
  biometria: limitador({ janelaMin: 15, max: 30, mensagem: 'Muitas tentativas com a biometria. Espere 15 minutos.' }),
  agendar: limitador({ janelaMin: 60, max: 20, mensagem: 'Muitos agendamentos em pouco tempo. Fale com a barbearia.' }),
};
