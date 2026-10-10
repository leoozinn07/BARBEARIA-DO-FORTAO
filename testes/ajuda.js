// Preparação comum dos testes: banco fortao_teste limpo, e-mails e push capturados, agente HTTP com CSRF.
process.env.NODE_ENV = 'test';
process.env.MYSQL_BANCO = process.env.MYSQL_BANCO_TESTE || 'fortao_teste';
process.env.APP_URL = 'http://localhost:3000';
process.env.AGENDADOR_ATIVO = 'false';
process.env.LIMITES_DESLIGADOS = 'true';
process.env.EMAIL_ADMIN = 'aviso@barbearia.test';
// Credenciais do MySQL local de desenvolvimento (troque pelas variáveis de ambiente no CI)
process.env.MYSQL_USUARIO ??= 'fortao';
process.env.MYSQL_SENHA ??= 'fortao_dev';

const { default: request } = await import('supertest');
const { criarApp } = await import('../servidor/app.js');
const db = await import('../servidor/db/index.js');
const { migrar } = await import('../servidor/db/migrar.js');
const { semear } = await import('../servidor/db/semear.js');
const { definirTransporte, processarFila } = await import('../servidor/emails/fila.js');
const { definirEnvioPush } = await import('../servidor/servicos/push.js');
const { limparCacheConfiguracoes } = await import('../servidor/servicos/configuracoes.js');
const { config } = await import('../servidor/config.js');
const { hashSenha } = await import('../servidor/lib/seguranca.js');

export { db, config, processarFila };

export const emails = [];
export const pushes = [];
definirTransporte({ sendMail: async (m) => { emails.push(m); return { messageId: String(emails.length) }; } });
definirEnvioPush(async (inscricao, carga) => { pushes.push({ inscricao, carga: JSON.parse(carga) }); });

export const app = criarApp();

export async function prepararBanco() {
  const { banco } = await db.umaLinha('SELECT DATABASE() AS banco');
  if (!String(banco).endsWith('_teste')) throw new Error(`Recusado: os testes só limpam bancos *_teste (atual: ${banco})`);
  const tabelas = await db.consulta("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()");
  await db.consulta('SET FOREIGN_KEY_CHECKS = 0');
  for (const { t } of tabelas) await db.consulta(`DROP TABLE IF EXISTS \`${t}\``);
  await db.consulta('SET FOREIGN_KEY_CHECKS = 1');
  await migrar();
  await semear();
  limparCacheConfiguracoes();
  emails.length = 0;
  pushes.length = 0;
}

export async function encerrar() {
  await db.fecharPool();
}

/** Agente com cookies e CSRF automáticos. */
export async function agente() {
  const a = request.agent(app);
  let csrf = (await a.get('/api/sessao')).body.csrf;
  const enviar = (metodo) => async (url, corpo) => {
    const r = await a[metodo](url).set('x-csrf-token', csrf).set('origin', config.origem).send(corpo);
    if (r.body?.csrf) csrf = r.body.csrf;
    return r;
  };
  return { a, get: (url) => a.get(url), post: enviar('post'), patch: enviar('patch'), put: enviar('put'), del: enviar('delete') };
}

let contador = 0;
export async function novoCliente(extra = {}) {
  contador++;
  const ag = await agente();
  const dados = { nome: `Cliente ${contador}`, email: `cliente${contador}-${Date.now()}@teste.com`, senha: 'CorteNaRegua!42', aceite: true, ...extra };
  const r = await ag.post('/api/auth/cadastro', dados);
  if (r.status !== 201) throw new Error(`cadastro falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return { ...ag, dados };
}

export async function novoAdmin() {
  const email = `admin-${Date.now()}-${++contador}@teste.com`;
  await db.consulta("INSERT INTO usuarios (nome, email, senha_hash, papel, email_verificado_em) VALUES ('Fortão', ?, ?, 'admin', UTC_TIMESTAMP())", [email, await hashSenha('Disciplina!Cohab5')]);
  const ag = await agente();
  const r = await ag.post('/api/auth/entrar', { email, senha: 'Disciplina!Cohab5' });
  if (r.status !== 200) throw new Error('login admin falhou');
  return { ...ag, email };
}

const diasUsados = new Set();
/** Primeiro dia aberto, ainda não usado por outro teste, a partir de `minDias` dias à frente. */
export async function diaAberto(servico = 'corte-fortao', minDias = 2) {
  const { body } = await request(app).get(`/api/dias?servico=${servico}`);
  const hoje = body.dias[0].data;
  const dia = body.dias.find((d, i) => i >= minDias && d.aberto && d.livres > 8 && !diasUsados.has(d.data));
  diasUsados.add(dia.data);
  const horarios = (await request(app).get(`/api/horarios?servico=${servico}&data=${dia.data}`)).body.horarios;
  return { data: dia.data, horarios, hoje };
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
