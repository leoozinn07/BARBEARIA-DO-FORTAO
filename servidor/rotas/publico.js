// Rotas públicas: sessão, configuração da barbearia, serviços e horários livres.
import { Router } from 'express';
import { config } from '../config.js';
import { consulta } from '../db/index.js';
import { garantirTokenCsrf } from '../middlewares/csrf.js';
import { campos, validar, z } from '../lib/validacao.js';
import { barbeiroPadrao, diasDisponiveis, horariosDoDia, listarServicos } from '../servicos/agenda.js';
import { lerConfiguracoes } from '../servicos/configuracoes.js';
import { rota, usuarioPublico } from './comum.js';

export const rotasPublicas = Router();

rotasPublicas.get('/saude', rota(async (_req, res) => {
  await consulta('SELECT 1');
  res.json({ ok: true });
}));

rotasPublicas.get('/sessao', (req, res) => {
  const csrf = garantirTokenCsrf(req, res);
  res.set('Cache-Control', 'no-store').json({ usuario: usuarioPublico(req.usuario), csrf });
});

rotasPublicas.get('/config', rota(async (_req, res) => {
  const { negocio, agenda } = await lerConfiguracoes();
  const barbeiroId = await barbeiroPadrao();
  const faixas = await consulta(
    "SELECT dia_semana, TIME_FORMAT(abre, '%H:%i') AS abre, TIME_FORMAT(fecha, '%H:%i') AS fecha FROM horarios_funcionamento WHERE barbeiro_id = ? ORDER BY dia_semana, abre",
    [barbeiroId],
  );
  res.set('Cache-Control', 'public, max-age=60').json({
    negocio: {
      nome: negocio.nome, endereco: negocio.endereco, bairro: negocio.bairro, cidade: negocio.cidade, uf: negocio.uf,
      whatsapp: negocio.whatsapp, instagram: negocio.instagram, email_contato: negocio.email_contato,
      razao_social: negocio.razao_social, cnpj: negocio.cnpj, encarregado_email: negocio.encarregado_email,
    },
    agenda: { janela_dias: agenda.janela_dias, cancelar_ate_horas: agenda.cancelar_ate_horas, antecedencia_min: agenda.antecedencia_min },
    funcionamento: faixas,
    versoes: { termos: config.versaoTermos, privacidade: config.versaoPrivacidade },
  });
}));

rotasPublicas.get('/servicos', rota(async (_req, res) => {
  const servicos = await listarServicos();
  res.set('Cache-Control', 'public, max-age=60').json({
    servicos: servicos.map(({ slug, nome, descricao, preco_centavos, duracao_min }) => ({ slug, nome, descricao, preco_centavos, duracao_min })),
  });
}));

rotasPublicas.get('/dias', validar(z.object({ servico: campos.slug }), 'query'), rota(async (req, res) => {
  const { dias } = await diasDisponiveis({ slug: req.dados.servico });
  res.set('Cache-Control', 'no-store').json({ dias });
}));

rotasPublicas.get('/horarios', validar(z.object({ servico: campos.slug, data: campos.dataISO }), 'query'), rota(async (req, res) => {
  const { horarios } = await horariosDoDia({ slug: req.dados.servico, dataISO: req.dados.data });
  res.set('Cache-Control', 'no-store').json({ data: req.dados.data, horarios });
}));

