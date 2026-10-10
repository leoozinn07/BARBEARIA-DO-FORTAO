// Validação de entrada com Zod e mensagens em português.
import { z } from 'zod';
import { erros } from './erros.js';

export { z };

export const campos = {
  nome: z.string({ error: 'Informe seu nome.' }).trim().min(2, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  email: z.string({ error: 'Informe seu e-mail.' }).trim().toLowerCase().max(190, 'E-mail muito longo.').pipe(z.email('E-mail inválido.')),
  senha: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(128, 'Use no máximo 128 caracteres.'),
  // Telefone/WhatsApp opcional: guarda só dígitos, aceita fixo ou celular com DDD
  telefone: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => s === '' || /^(55)?\d{10,11}$/.test(s), 'Telefone com DDD, só números.')
    .transform((s) => (s === '' ? null : s))
    .optional()
    .nullable(),
  token: z.string().trim().min(20, 'Link inválido.').max(200, 'Link inválido.'),
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/, 'Código inválido.'),
  dataISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  instante: z.iso.datetime({ offset: true, error: 'Horário inválido.' }),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'Serviço inválido.'),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida.'),
};

/** Converte o erro do Zod em { campo: mensagem } */
export function camposDoErro(erro) {
  const saida = {};
  for (const problema of erro.issues) {
    const chave = problema.path.join('.') || '_';
    saida[chave] ||= problema.message;
  }
  return saida;
}

export function validar(esquema, origem = 'body') {
  return (req, _res, next) => {
    const r = esquema.safeParse(req[origem] ?? {});
    if (!r.success) return next(erros.validacao(camposDoErro(r.error)));
    req.dados = r.data;
    next();
  };
}
