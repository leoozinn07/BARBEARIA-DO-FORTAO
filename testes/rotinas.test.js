import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { db, emails, encerrar, novoCliente, prepararBanco, processarFila } from './ajuda.js';
import { definirTransporte } from '../servidor/emails/fila.js';
import { processarLembretes } from '../servidor/servicos/rotinas.js';

before(prepararBanco);
after(encerrar);

async function inserirHorario(clienteEmail, emMs, codigo) {
  const { id } = await db.umaLinha('SELECT id FROM usuarios WHERE email = ?', [clienteEmail]);
  const inicio = new Date(Date.now() + emMs);
  await db.consulta(
    "INSERT INTO agendamentos (codigo, cliente_id, cliente_nome, barbeiro_id, servico_id, servico_nome, preco_centavos, duracao_min, inicio, fim) VALUES (?, ?, 'Cliente', 1, 1, 'Corte Fortão', 4000, 40, ?, ?)",
    [codigo, id, inicio, new Date(inicio.getTime() + 2400000)],
  );
}

describe('lembretes', () => {
  it('manda o de 24 h uma vez só e depois o de 2 h', async () => {
    const c = await novoCliente();
    await inserirHorario(c.dados.email, 23 * 3600000, 'LEMBRA24');
    emails.length = 0;
    assert.equal(await processarLembretes(), 1);
    assert.equal(await processarLembretes(), 0, 'rodar de novo não duplica');
    await processarFila();
    assert.equal(emails.filter((m) => /Amanhã tem corte/.test(m.subject)).length, 1);

    // Uma hora antes do horário
    const quaseLa = new Date(Date.now() + 22 * 3600000);
    assert.equal(await processarLembretes(quaseLa), 1);
    await processarFila();
    assert.equal(emails.filter((m) => /Daqui a pouco/.test(m.subject)).length, 1);
    const avisos = await c.get('/api/notificacoes');
    assert.ok(avisos.body.notificacoes.some((n) => n.tipo === 'lembrete_2h'));
  });

  it('horário cancelado não recebe lembrete', async () => {
    const c = await novoCliente();
    await inserirHorario(c.dados.email, 20 * 3600000, 'CANCEL24');
    await db.consulta("UPDATE agendamentos SET status = 'cancelado' WHERE codigo = 'CANCEL24'");
    assert.equal(await processarLembretes(), 0);
  });

  it('dois processos ao mesmo tempo não duplicam o lembrete', async () => {
    const c = await novoCliente();
    await inserirHorario(c.dados.email, 10 * 3600000, 'CORRIDA1');
    const [a, b] = await Promise.all([processarLembretes(), processarLembretes()]);
    assert.equal(a + b, 1);
  });
});

describe('fila de e-mails', () => {
  it('tenta de novo depois de uma falha e entrega quando o SMTP volta', async () => {
    await db.consulta('UPDATE emails_saida SET enviado_em = UTC_TIMESTAMP() WHERE enviado_em IS NULL');
    await db.consulta("INSERT INTO emails_saida (para, assunto, html, texto) VALUES ('falha@teste.com', 'Teste', '<p>oi</p>', 'oi')");
    let falhar = true;
    const capturados = [];
    definirTransporte({ sendMail: async (m) => { if (falhar) throw new Error('SMTP fora do ar'); capturados.push(m); } });
    assert.equal(await processarFila(), 0);
    let linha = await db.umaLinha("SELECT tentativas, erro, enviado_em FROM emails_saida WHERE para = 'falha@teste.com'");
    assert.equal(linha.tentativas, 1);
    assert.match(linha.erro, /SMTP fora do ar/);
    assert.equal(linha.enviado_em, null);
    // Simula a passagem do tempo até a próxima tentativa
    await db.consulta("UPDATE emails_saida SET proxima_tentativa_em = UTC_TIMESTAMP() WHERE para = 'falha@teste.com'");
    falhar = false;
    assert.equal(await processarFila(), 1);
    linha = await db.umaLinha("SELECT tentativas, enviado_em FROM emails_saida WHERE para = 'falha@teste.com'");
    assert.ok(linha.enviado_em);
    assert.equal(capturados[0].to, 'falha@teste.com');
    definirTransporte({ sendMail: async (m) => { emails.push(m); } });
  });
});
