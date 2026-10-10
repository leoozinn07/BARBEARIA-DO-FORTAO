import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { agente, app, config, db, emails, encerrar, novoCliente, prepararBanco, processarFila } from './ajuda.js';
import request from 'supertest';

before(prepararBanco);
after(encerrar);

const linkDoEmail = (m) => m.text.match(/https?:\/\/\S+token=([\w-]+)/)?.[1];

describe('cadastro', () => {
  it('exige aceite dos termos e senha forte', async () => {
    const ag = await agente();
    let r = await ag.post('/api/auth/cadastro', { nome: 'Ana', email: 'ana@teste.com', senha: 'CorteNaRegua!42' });
    assert.equal(r.status, 422);
    assert.ok(r.body.campos.aceite);
    r = await ag.post('/api/auth/cadastro', { nome: 'Ana', email: 'ana@teste.com', senha: '12345678', aceite: true });
    assert.equal(r.status, 422);
    assert.match(r.body.campos.senha, /comum/);
  });

  it('cria a conta, entra na hora, registra consentimento e manda e-mail de verificação', async () => {
    const ag = await agente();
    const r = await ag.post('/api/auth/cadastro', { nome: 'Bruno Lima', email: 'Bruno@Teste.com', telefone: '(11) 98888-7777', senha: 'CorteNaRegua!42', aceite: true });
    assert.equal(r.status, 201);
    assert.equal(r.body.usuario.email, 'bruno@teste.com');
    assert.equal(r.body.usuario.telefone, '11988887777');
    assert.equal(r.body.usuario.email_verificado, false);
    assert.equal((await ag.get('/api/conta')).status, 200);

    const consent = await db.consulta("SELECT tipo, aceito FROM consentimentos c JOIN usuarios u ON u.id = c.usuario_id WHERE u.email = 'bruno@teste.com' ORDER BY CAST(tipo AS CHAR)");
    assert.deepEqual(consent.map((c) => [c.tipo, c.aceito]), [['marketing', 0], ['privacidade', 1], ['termos', 1]]);

    await processarFila();
    const email = emails.find((m) => m.to === 'bruno@teste.com');
    assert.match(email.subject, /Confirme seu e-mail/);
    const token = linkDoEmail(email);
    assert.ok(token);

    assert.equal((await ag.post('/api/auth/verificar-email', { token })).status, 200);
    assert.equal((await ag.get('/api/conta')).body.usuario.email_verificado, true);
    // Link de uso único
    assert.equal((await ag.post('/api/auth/verificar-email', { token })).status, 400);
  });

  it('recusa e-mail repetido', async () => {
    const ag = await agente();
    const r = await ag.post('/api/auth/cadastro', { nome: 'Outro', email: 'bruno@teste.com', senha: 'OutraSenha!99', aceite: true });
    assert.equal(r.status, 409);
  });
});

describe('CSRF', () => {
  it('bloqueia pedido sem token ou de outra origem', async () => {
    const semToken = await request(app).post('/api/auth/entrar').send({ email: 'x@y.com', senha: 'qualquer1' });
    assert.equal(semToken.status, 403);
    const ag = await agente();
    const csrf = (await ag.get('/api/sessao')).body.csrf;
    const outraOrigem = await ag.a.post('/api/auth/entrar').set('x-csrf-token', csrf).set('origin', 'https://site-malicioso.com').send({ email: 'x@y.com', senha: 'qualquer1' });
    assert.equal(outraOrigem.status, 403);
  });
});

describe('entrar e sair', () => {
  it('mensagem genérica para e-mail inexistente e senha errada', async () => {
    const ag = await agente();
    const a = await ag.post('/api/auth/entrar', { email: 'naoexiste@teste.com', senha: 'Qualquer!123' });
    const b = await ag.post('/api/auth/entrar', { email: 'bruno@teste.com', senha: 'Errada!12345' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.erro, b.body.erro);
  });

  it('trava a conta depois de muitas senhas erradas', async () => {
    const c = await novoCliente();
    const ag = await agente();
    for (let i = 0; i < 9; i++) await ag.post('/api/auth/entrar', { email: c.dados.email, senha: `Errada!${i}xyz` });
    const r = await ag.post('/api/auth/entrar', { email: c.dados.email, senha: c.dados.senha });
    assert.equal(r.status, 429);
  });

  it('sair encerra a sessão', async () => {
    const c = await novoCliente();
    assert.equal((await c.get('/api/conta')).status, 200);
    assert.equal((await c.post('/api/auth/sair', {})).status, 200);
    assert.equal((await c.get('/api/conta')).status, 401);
  });
});

describe('esqueci a senha', () => {
  it('responde igual com ou sem conta e redefine com link de uso único', async () => {
    const c = await novoCliente();
    const outro = await agente();
    emails.length = 0;
    const a = await outro.post('/api/auth/esqueci-senha', { email: 'ninguem@teste.com' });
    const b = await outro.post('/api/auth/esqueci-senha', { email: c.dados.email });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
    await new Promise((r) => setTimeout(r, 150));
    await processarFila();
    const email = emails.find((m) => m.to === c.dados.email && /Redefinir/.test(m.subject));
    assert.ok(email, 'e-mail de redefinição enviado');
    assert.equal(emails.filter((m) => m.to === 'ninguem@teste.com').length, 0);
    const token = linkDoEmail(email);

    const fraca = await outro.post('/api/auth/redefinir-senha', { token, senha: 'password' });
    assert.equal(fraca.status, 422);
    // Senha fraca não queima o link: o pedido inteiro voltou atrás
    const ok = await outro.post('/api/auth/redefinir-senha', { token, senha: 'NovaSenhaForte!7' });
    assert.equal(ok.status, 200);
    // A sessão antiga do cliente caiu
    assert.equal((await c.get('/api/conta')).status, 401);
    assert.equal((await outro.post('/api/auth/redefinir-senha', { token, senha: 'OutraSenha!88' })).status, 400);
    const novo = await agente();
    assert.equal((await novo.post('/api/auth/entrar', { email: c.dados.email, senha: 'NovaSenhaForte!7' })).status, 200);
  });
});

describe('cabeçalhos de segurança', () => {
  it('envia CSP sem script inline e cookie de sessão HttpOnly', async () => {
    const r = await request(app).get('/api/sessao');
    assert.match(r.headers['content-security-policy'], /script-src 'self'/);
    assert.doesNotMatch(r.headers['content-security-policy'], /unsafe-inline/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    const ag = await agente();
    const cad = await ag.post('/api/auth/cadastro', { nome: 'Cookie', email: 'cookie@teste.com', senha: 'CorteNaRegua!42', aceite: true });
    const cookie = cad.headers['set-cookie'].find((c) => c.startsWith(config.sessao.cookie));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });
});
