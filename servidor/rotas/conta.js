// Área do cliente: perfil, senha, LGPD (exportar/excluir), agendamentos e avisos.
import { Router } from 'express';
import { config } from '../config.js';
import { consulta, executar, umaLinha, transacao } from '../db/index.js';
import * as modelos from '../emails/modelos.js';
import { acordarEntregador, enfileirarEmail } from '../emails/fila.js';
import { erros } from '../lib/erros.js';
import { conferirSenha, hashSenha, motivoSenhaFraca } from '../lib/seguranca.js';
import { campos, validar, z } from '../lib/validacao.js';
import { limites } from '../middlewares/limites.js';
import { encerrarSessao, encerrarTodas, exigirLogin } from '../middlewares/sessao.js';
import { cancelarAgendamento, criarAgendamento, paraCliente, remarcarAgendamento } from '../servicos/agenda.js';
import { auditar } from '../servicos/auditoria.js';
import { lerConfiguracoes } from '../servicos/configuracoes.js';
import { criarAviso } from '../servicos/eventos.js';
import { rota, usuarioPublico } from './comum.js';

export const rotasConta = Router();
rotasConta.use(exigirLogin);

// ------------------------------------------------------------------ perfil
rotasConta.get('/conta', (req, res) => res.set('Cache-Control', 'no-store').json({ usuario: usuarioPublico(req.usuario) }));

const esquemaPerfil = z.object({
  nome: campos.nome.optional(),
  telefone: campos.telefone,
  marketing: z.boolean().optional(),
  preferencias: z.object({
    tema: z.enum(['escuro', 'claro', 'auto']).optional(),
    letra_grande: z.boolean().optional(),
  }).optional(),
});

rotasConta.patch('/conta', validar(esquemaPerfil), rota(async (req, res) => {
  const d = req.dados;
  const u = req.usuario;
  const prefsAtuais = u.preferencias || {};
  const prefs = { ...prefsAtuais, ...(d.preferencias || {}) };
  await transacao(async (conn) => {
    await executar('UPDATE usuarios SET nome = $1, telefone = $2, marketing = $3, preferencias = $4 WHERE id = $5', [
      d.nome ?? u.nome,
      d.telefone === undefined ? u.telefone : d.telefone,
      d.marketing === undefined ? u.marketing : d.marketing,
      JSON.stringify(prefs),
      u.id,
    ], conn);
    if (d.marketing !== undefined && d.marketing !== u.marketing) {
      await executar('INSERT INTO consentimentos (usuario_id, tipo, versao, aceito, ip) VALUES ($1, $2, $3, $4, $5)', [
        u.id, 'marketing', config.versaoPrivacidade, d.marketing, req.ip?.slice(0, 45) ?? null,
      ], conn);
    }
  });
  const atualizado = await umaLinha('SELECT * FROM usuarios WHERE id = $1', [u.id]);
  res.json({ usuario: usuarioPublico(atualizado) });
}));

rotasConta.post('/conta/senha', limites.senha, validar(z.object({ senha_atual: campos.senha, senha_nova: campos.senha })), rota(async (req, res) => {
  const { senha_atual: atual, senha_nova: nova } = req.dados;
  const { senha_hash: hashAtual } = await umaLinha('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
  if (!(await conferirSenha(hashAtual, atual))) throw erros.validacao({ senha_atual: 'Senha atual incorreta.' });
  const fraca = motivoSenhaFraca(nova, req.usuario);
  if (fraca) throw erros.validacao({ senha_nova: fraca });
  const novoHash = await hashSenha(nova);
  await transacao(async (conn) => {
    await executar('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [novoHash, req.usuario.id], conn);
    await encerrarTodas(req.usuario.id, req.sessao.id, conn);
    await enfileirarEmail(conn, { para: req.usuario.email, ...modelos.senhaAlterada({ nome: req.usuario.nome }) });
  });
  acordarEntregador();
  await auditar({ usuarioId: req.usuario.id, acao: 'trocou_senha', ip: req.ip });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ LGPD
rotasConta.get('/conta/dados', rota(async (req, res) => {
  const id = req.usuario.id;
  const [perfil, consentimentos, agendamentos, notificacoes, sessoes] = await Promise.all([
    umaLinha('SELECT nome, email, telefone, papel, email_verificado_em, marketing, preferencias, criado_em, atualizado_em FROM usuarios WHERE id = $1', [id]),
    consulta('SELECT tipo, versao, aceito, criado_em FROM consentimentos WHERE usuario_id = $1 ORDER BY id', [id]),
    consulta('SELECT codigo, servico_nome, preco_centavos, duracao_min, inicio, fim, status, cancelado_por, motivo_cancelamento, criado_em FROM agendamentos WHERE cliente_id = $1 ORDER BY inicio', [id]),
    consulta('SELECT tipo, titulo, corpo, lida_em, criado_em FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [id]),
    consulta('SELECT criado_em, ultimo_uso_em, expira_em, ip, agente FROM sessoes WHERE usuario_id = $1 ORDER BY id', [id]),
  ]);
  await auditar({ usuarioId: id, acao: 'exportou_dados', ip: req.ip });
  res
    .set('Cache-Control', 'no-store')
    .attachment(`meus-dados-barbearia-do-fortao-${new Date().toISOString().slice(0, 10)}.json`)
    .json({
      gerado_em: new Date().toISOString(),
      controlador: 'Barbearia do Fortão',
      titular: perfil,
      consentimentos,
      agendamentos,
      notificacoes,
      sessoes,
    });
}));

rotasConta.post('/conta/excluir', limites.senha, validar(z.object({ senha: campos.senha })), rota(async (req, res) => {
  const u = req.usuario;
  const { senha_hash: hashAtual } = await umaLinha('SELECT senha_hash FROM usuarios WHERE id = $1', [u.id]);
  if (!(await conferirSenha(hashAtual, req.dados.senha))) throw erros.validacao({ senha: 'Senha incorreta.' });
  if (u.papel === 'admin') throw erros.conflito('A conta do admin não pode ser excluída pelo site.', 'admin');
  await transacao(async (conn) => {
    const futuros = await consulta(
      "SELECT codigo, servico_nome, inicio FROM agendamentos WHERE cliente_id = $1 AND status = 'confirmado' AND inicio > now()",
      [u.id], conn,
    );
    if (futuros.length) {
      await executar(
        "UPDATE agendamentos SET status = 'cancelado', cancelado_por = 'cliente', motivo_cancelamento = 'Conta excluída' WHERE cliente_id = $1 AND status = 'confirmado' AND inicio > now()",
        [u.id], conn,
      );
      const admins = await consulta("SELECT id FROM usuarios WHERE papel = 'admin' AND excluido_em IS NULL", [], conn);
      for (const a of admins) {
        await criarAviso(conn, { usuarioId: a.id, tipo: 'cancelado', titulo: 'Horários liberados', corpo: `Um cliente excluiu a conta e ${futuros.length} horário(s) ficaram livres.`, link: '/admin' });
      }
    }
    await enfileirarEmail(conn, { para: u.email, ...modelos.contaExcluida({ nome: u.nome }) });
    // Anonimiza: o histórico de atendimentos fica, sem nada que identifique a pessoa
    await executar(
      `UPDATE usuarios SET nome = 'Cliente removido', email = 'removido-' || id || '@excluido.invalid', telefone = NULL,
         senha_hash = '!', marketing = false, preferencias = NULL, email_verificado_em = NULL, excluido_em = now() WHERE id = $1`,
      [u.id], conn,
    );
    await executar("UPDATE agendamentos SET cliente_nome = 'Cliente removido', cliente_telefone = NULL WHERE cliente_id = $1", [u.id], conn);
    await executar('UPDATE consentimentos SET ip = NULL WHERE usuario_id = $1', [u.id], conn);
    await executar('UPDATE auditoria SET ip = NULL WHERE usuario_id = $1', [u.id], conn);
    for (const tabela of ['notificacoes', 'tokens_uso_unico', 'sessoes']) {
      await executar(`DELETE FROM ${tabela} WHERE usuario_id = $1`, [u.id], conn);
    }
  });
  acordarEntregador();
  await auditar({ usuarioId: u.id, acao: 'excluiu_conta' });
  await encerrarSessao({ sessao: null }, res);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ agendamentos do cliente
rotasConta.get('/conta/agendamentos', rota(async (req, res) => {
  const { agenda } = await lerConfiguracoes();
  const linhas = await consulta(
    'SELECT a.*, s.slug AS servico_slug FROM agendamentos a JOIN servicos s ON s.id = a.servico_id WHERE a.cliente_id = $1 ORDER BY a.inicio DESC LIMIT 100',
    [req.usuario.id],
  );
  const agora = Date.now();
  const todos = linhas.map((a) => paraCliente(a, agenda));
  res.set('Cache-Control', 'no-store').json({
    proximos: todos.filter((a) => a.status === 'confirmado' && new Date(a.fim).getTime() > agora).reverse(),
    historico: todos.filter((a) => !(a.status === 'confirmado' && new Date(a.fim).getTime() > agora)),
  });
}));

rotasConta.post('/agendamentos', limites.agendar, validar(z.object({ servico: campos.slug, inicio: campos.instante })), rota(async (req, res) => {
  const { agenda } = await lerConfiguracoes();
  const ag = await criarAgendamento({
    cliente: { id: req.usuario.id, nome: req.usuario.nome, telefone: req.usuario.telefone },
    slug: req.dados.servico,
    inicio: req.dados.inicio,
  });
  res.status(201).json({ agendamento: paraCliente(ag, agenda) });
}));

rotasConta.post('/agendamentos/:codigo/cancelar', validar(z.object({ codigo: campos.codigo }), 'params'), rota(async (req, res) => {
  const { agenda } = await lerConfiguracoes();
  const ag = await cancelarAgendamento({ codigo: req.dados.codigo, usuario: req.usuario });
  res.json({ agendamento: paraCliente(ag, agenda) });
}));

rotasConta.post('/agendamentos/:codigo/remarcar', limites.agendar, validar(z.object({ codigo: campos.codigo }), 'params'), rota(async (req, res) => {
  const corpo = z.object({ inicio: campos.instante }).safeParse(req.body);
  if (!corpo.success) throw erros.validacao({ inicio: 'Horário inválido.' });
  const { agenda } = await lerConfiguracoes();
  const ag = await remarcarAgendamento({ codigo: req.dados.codigo, usuario: req.usuario, inicio: corpo.data.inicio });
  res.json({ agendamento: paraCliente(ag, agenda) });
}));

// ------------------------------------------------------------------ avisos (central de notificações)
rotasConta.get('/notificacoes', rota(async (req, res) => {
  const lista = await consulta('SELECT id, tipo, titulo, corpo, link, lida_em, criado_em FROM notificacoes WHERE usuario_id = $1 ORDER BY id DESC LIMIT 50', [req.usuario.id]);
  res.set('Cache-Control', 'no-store').json({
    nao_lidas: lista.filter((n) => !n.lida_em).length,
    notificacoes: lista.map((n) => ({ ...n, lida: Boolean(n.lida_em), lida_em: undefined })),
  });
}));

rotasConta.post('/notificacoes/lidas', validar(z.object({ ids: z.array(z.number().int().positive()).max(100).optional() })), rota(async (req, res) => {
  const { ids } = req.dados;
  if (ids?.length) {
    await executar('UPDATE notificacoes SET lida_em = now() WHERE usuario_id = $1 AND id = ANY($2::bigint[]) AND lida_em IS NULL', [req.usuario.id, ids]);
  } else {
    await executar('UPDATE notificacoes SET lida_em = now() WHERE usuario_id = $1 AND lida_em IS NULL', [req.usuario.id]);
  }
  res.json({ ok: true });
}));
