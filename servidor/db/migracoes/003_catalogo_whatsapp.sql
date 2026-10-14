-- Catálogo novo, serviços adicionais (luzes, boyzão, progressiva) e lembretes pelo WhatsApp.

-- Serviço principal (o corte) ou adicional (soma ao corte, nunca é marcado sozinho)
ALTER TABLE servicos ADD COLUMN tipo ENUM('principal', 'adicional') NOT NULL DEFAULT 'principal' AFTER descricao;

-- Bancos que já tinham o catálogo antigo passam para o novo. Preços que o Fortão já mudou ficam como estão.
-- Banco novo (sem serviços) recebe o catálogo pela carga inicial, em servidor/db/semear.js.
SET @tem_catalogo = (SELECT COUNT(*) FROM servicos);
UPDATE servicos SET slug = 'corte-normal', nome = 'Corte normal', descricao = 'O corte do dia a dia, do jeito que você pedir.', ordem = 2 WHERE slug = 'corte-fortao';
UPDATE servicos SET nome = 'Corte + sobrancelha', descricao = 'Corte completo com a sobrancelha alinhada na navalha.', ordem = 3 WHERE slug = 'corte-sobrancelha';
UPDATE servicos SET nome = 'Corte + barba', descricao = 'Cabelo e barba feitos na mesma cadeira.', ordem = 5 WHERE slug = 'corte-barba';
INSERT IGNORE INTO servicos (slug, nome, descricao, tipo, preco_centavos, duracao_min, ordem)
SELECT novo.* FROM (
  SELECT 'corte-navalhado' AS slug, 'Corte navalhado' AS nome, 'Acabamento na navalha, pele limpa e risco no capricho.' AS descricao, 'principal' AS tipo, 4500 AS preco, 45 AS duracao, 1 AS ordem
  UNION ALL SELECT 'corte-sobrancelha-barba', 'Corte + sobrancelha + barba', 'O pacote completo: cabelo, barba e sobrancelha.', 'principal', 6000, 70, 4
  UNION ALL SELECT 'luzes', 'Luzes', 'Mechas claras para dar destaque ao corte.', 'adicional', 6000, 60, 10
  UNION ALL SELECT 'boyzao', 'Boyzão', 'Finalização no estilo boyzão.', 'adicional', 3000, 30, 11
  UNION ALL SELECT 'progressiva', 'Progressiva', 'Alisa e tira o volume do cabelo.', 'adicional', 8000, 90, 12
) AS novo WHERE @tem_catalogo > 0;

-- Adicionais escolhidos em cada horário, com nome e preço do momento da marcação
CREATE TABLE agendamento_adicionais (
  agendamento_id BIGINT UNSIGNED NOT NULL,
  servico_id INT UNSIGNED NOT NULL,
  nome VARCHAR(80) NOT NULL,
  preco_centavos INT UNSIGNED NOT NULL,
  duracao_min SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (agendamento_id, servico_id),
  KEY ix_ag_adicionais_servico (servico_id),
  CONSTRAINT fk_ag_adicionais_agendamento FOREIGN KEY (agendamento_id) REFERENCES agendamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_ag_adicionais_servico FOREIGN KEY (servico_id) REFERENCES servicos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- O nome do horário inclui os adicionais ("Corte normal + Luzes"); preço e duração já são a soma de tudo
ALTER TABLE agendamentos
  MODIFY servico_nome VARCHAR(200) NOT NULL,
  ADD COLUMN whatsapp_lembrete TINYINT(1) NOT NULL DEFAULT 0 AFTER observacao,
  ADD COLUMN presenca_confirmada_em DATETIME NULL AFTER whatsapp_lembrete;

ALTER TABLE consentimentos MODIFY tipo ENUM('termos', 'privacidade', 'marketing', 'whatsapp') NOT NULL;

-- Fila de saída do WhatsApp (mesmo modelo da fila de e-mails: gravada junto com o evento, entregue com novas tentativas)
CREATE TABLE whatsapp_saida (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  para VARCHAR(20) NOT NULL,
  modelo VARCHAR(60) NULL,
  parametros JSON NULL,
  texto TEXT NOT NULL,
  agendamento_id BIGINT UNSIGNED NULL,
  tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  proxima_tentativa_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_em DATETIME NULL,
  erro VARCHAR(500) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_whatsapp_pendentes (enviado_em, proxima_tentativa_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Mensagens recebidas já tratadas pelo robô (a Meta pode reenviar a mesma; cada uma só é tratada uma vez)
CREATE TABLE whatsapp_recebidas (
  mensagem_id VARCHAR(128) PRIMARY KEY,
  de VARCHAR(20) NOT NULL,
  recebida_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_whatsapp_recebidas_data (recebida_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
