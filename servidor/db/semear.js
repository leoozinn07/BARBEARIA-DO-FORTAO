// Dados iniciais. Pode rodar várias vezes: só cria o que ainda não existe.
import { fileURLToPath } from 'node:url';
import { executar, umaLinha, fecharPool } from './index.js';
import { log } from '../lib/log.js';

export const SERVICOS_INICIAIS = [
  { slug: 'corte-fortao', nome: 'Corte Fortão', descricao: 'O corte da casa, do jeito que você pedir.', preco_centavos: 4000, duracao_min: 40, ordem: 1 },
  { slug: 'corte-sobrancelha', nome: 'Corte e sobrancelha', descricao: 'Corte completo com a sobrancelha alinhada.', preco_centavos: 4500, duracao_min: 45, ordem: 2 },
  { slug: 'corte-barba', nome: 'Corte e barba', descricao: 'Cabelo e barba feitos na mesma cadeira.', preco_centavos: 5000, duracao_min: 60, ordem: 3 },
];

// 0 = domingo. Terça a sexta 9h às 20h, sábado 8h às 18h. Domingo e segunda fechado.
export const HORARIOS_INICIAIS = [
  [2, '09:00', '20:00'], [3, '09:00', '20:00'], [4, '09:00', '20:00'], [5, '09:00', '20:00'], [6, '08:00', '18:00'],
];

export const CONFIG_INICIAL = {
  negocio: {
    nome: 'Barbearia do Fortão',
    endereco: '',
    bairro: 'Cohab 5',
    cidade: 'São Paulo',
    uf: 'SP',
    whatsapp: '',
    instagram: '',
    email_contato: '',
    razao_social: '',
    cnpj: '',
    encarregado_email: '',
  },
  agenda: {
    antecedencia_min: 30, // minutos mínimos entre agora e o horário marcado
    janela_dias: 30, // até quantos dias à frente a agenda abre
    passo_min: 15, // de quanto em quanto tempo um horário pode começar
    cancelar_ate_horas: 2, // cliente cancela ou remarca até X horas antes
    max_futuros_por_cliente: 3,
  },
};

export async function semear() {
  let barbeiro = await umaLinha('SELECT id FROM barbeiros ORDER BY id LIMIT 1');
  if (!barbeiro) {
    barbeiro = await umaLinha('INSERT INTO barbeiros (nome) VALUES ($1) RETURNING id', ['Fortão']);
    for (const [dia, abre, fecha] of HORARIOS_INICIAIS) {
      await executar('INSERT INTO horarios_funcionamento (barbeiro_id, dia_semana, abre, fecha) VALUES ($1, $2, $3, $4)', [barbeiro.id, dia, abre, fecha]);
    }
    // Catálogo inicial só no primeiro uso: depois disso quem manda nos serviços é o painel
    for (const s of SERVICOS_INICIAIS) {
      await executar(
        'INSERT INTO servicos (slug, nome, descricao, preco_centavos, duracao_min, ordem) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING',
        [s.slug, s.nome, s.descricao, s.preco_centavos, s.duracao_min, s.ordem],
      );
    }
  }
  for (const [chave, valor] of Object.entries(CONFIG_INICIAL)) {
    await executar('INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING', [chave, JSON.stringify(valor)]);
  }
  return barbeiro.id;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  semear()
    .then(() => { log.info('semeado'); return fecharPool(); })
    .catch((e) => { log.erro('semear_falhou', { erro: e.message }); process.exit(1); });
}
