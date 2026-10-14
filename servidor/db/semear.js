// Dados iniciais. Pode rodar várias vezes: só cria o que ainda não existe.
import { fileURLToPath } from 'node:url';
import { consulta, umaLinha, fecharPool } from './index.js';
import { log } from '../lib/log.js';

// Preços e durações iniciais: o Fortão muda tudo pelo painel (aba Serviços)
export const SERVICOS_INICIAIS = [
  { slug: 'corte-navalhado', nome: 'Corte navalhado', descricao: 'Acabamento na navalha, pele limpa e risco no capricho.', tipo: 'principal', preco_centavos: 4500, duracao_min: 45, ordem: 1 },
  { slug: 'corte-normal', nome: 'Corte normal', descricao: 'O corte do dia a dia, do jeito que você pedir.', tipo: 'principal', preco_centavos: 4000, duracao_min: 40, ordem: 2 },
  { slug: 'corte-sobrancelha', nome: 'Corte + sobrancelha', descricao: 'Corte completo com a sobrancelha alinhada na navalha.', tipo: 'principal', preco_centavos: 4500, duracao_min: 45, ordem: 3 },
  { slug: 'corte-sobrancelha-barba', nome: 'Corte + sobrancelha + barba', descricao: 'O pacote completo: cabelo, barba e sobrancelha.', tipo: 'principal', preco_centavos: 6000, duracao_min: 70, ordem: 4 },
  { slug: 'corte-barba', nome: 'Corte + barba', descricao: 'Cabelo e barba feitos na mesma cadeira.', tipo: 'principal', preco_centavos: 5000, duracao_min: 60, ordem: 5 },
  // Adicionais: somam ao corte (preço e tempo), nunca são marcados sozinhos
  { slug: 'luzes', nome: 'Luzes', descricao: 'Mechas claras para dar destaque ao corte.', tipo: 'adicional', preco_centavos: 6000, duracao_min: 60, ordem: 10 },
  { slug: 'boyzao', nome: 'Boyzão', descricao: 'Finalização no estilo boyzão.', tipo: 'adicional', preco_centavos: 3000, duracao_min: 30, ordem: 11 },
  { slug: 'progressiva', nome: 'Progressiva', descricao: 'Alisa e tira o volume do cabelo.', tipo: 'adicional', preco_centavos: 8000, duracao_min: 90, ordem: 12 },
];

// 0 = domingo. Terça a sexta 9h às 20h, sábado 8h às 18h. Domingo e segunda: fechado.
export const HORARIOS_INICIAIS = [
  [2, '09:00', '20:00'], [3, '09:00', '20:00'], [4, '09:00', '20:00'], [5, '09:00', '20:00'], [6, '08:00', '18:00'],
];

export const CONFIG_INICIAL = {
  negocio: {
    nome: 'Barbearia do Fortão',
    endereco: 'Av. Tancredo de Almeida Neves, 1463',
    bairro: 'Cohab 5',
    cidade: 'Carapicuíba',
    uf: 'SP',
    mapa_link: '', // link de compartilhar do Google Maps (opcional); sem ele, o mapa usa o endereço
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
    const r = await consulta('INSERT INTO barbeiros (nome) VALUES (?)', ['Fortão']);
    barbeiro = { id: r.insertId };
    for (const [dia, abre, fecha] of HORARIOS_INICIAIS) {
      await consulta('INSERT INTO horarios_funcionamento (barbeiro_id, dia_semana, abre, fecha) VALUES (?, ?, ?, ?)', [barbeiro.id, dia, abre, fecha]);
    }
    // Catálogo inicial só no primeiro uso: depois disso quem manda nos serviços é o painel
    // (um serviço removido pelo Fortão não volta sozinho quando o site reinicia)
    for (const s of SERVICOS_INICIAIS) {
      await consulta(
        'INSERT IGNORE INTO servicos (slug, nome, descricao, tipo, preco_centavos, duracao_min, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [s.slug, s.nome, s.descricao, s.tipo, s.preco_centavos, s.duracao_min, s.ordem],
      );
    }
  }
  for (const [chave, valor] of Object.entries(CONFIG_INICIAL)) {
    await consulta('INSERT IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)', [chave, JSON.stringify(valor)]);
  }
  return barbeiro.id;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  semear()
    .then(() => { log.info('semeado'); return fecharPool(); })
    .catch((e) => { log.erro('semear_falhou', { erro: e.message }); process.exit(1); });
}
