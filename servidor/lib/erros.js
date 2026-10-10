// Erro de regra de negócio com status HTTP e mensagem pronta para mostrar ao cliente.
export class ErroApp extends Error {
  constructor(status, mensagem, { codigo, campos } = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

export const erros = {
  requisicao: (msg, extra) => new ErroApp(400, msg, extra),
  naoAutenticado: (msg = 'Entre na sua conta para continuar.') => new ErroApp(401, msg, { codigo: 'nao_autenticado' }),
  proibido: (msg = 'Você não tem permissão para isso.') => new ErroApp(403, msg, { codigo: 'proibido' }),
  naoEncontrado: (msg = 'Não encontramos o que você procurou.') => new ErroApp(404, msg, { codigo: 'nao_encontrado' }),
  conflito: (msg, codigo = 'conflito') => new ErroApp(409, msg, { codigo }),
  validacao: (campos, msg = 'Confira os campos destacados.') => new ErroApp(422, msg, { codigo: 'validacao', campos }),
  muitas: (msg = 'Muitas tentativas. Espere alguns minutos e tente de novo.') => new ErroApp(429, msg, { codigo: 'limite' }),
};
