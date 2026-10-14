-- Esquema inicial da Barbearia do Fortão.
-- Datas em UTC. Dinheiro em centavos. Textos em utf8mb4.

CREATE TABLE usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  telefone VARCHAR(20) NULL,
  senha_hash VARCHAR(255) NOT NULL,
  papel ENUM('cliente', 'admin') NOT NULL DEFAULT 'cliente',
  email_verificado_em DATETIME NULL,
  marketing TINYINT(1) NOT NULL DEFAULT 0,
  preferencias JSON NULL,
  tentativas_falhas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_ate DATETIME NULL,
  excluido_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sessoes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em DATETIME NOT NULL,
  ultimo_uso_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(45) NULL,
  agente VARCHAR(255) NULL,
  UNIQUE KEY uq_sessoes_token (token_hash),
  KEY ix_sessoes_usuario (usuario_id),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tokens_uso_unico (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('verificar_email', 'redefinir_senha') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expira_em DATETIME NOT NULL,
  usado_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tokens_hash (token_hash),
  KEY ix_tokens_usuario (usuario_id, tipo),
  CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE consentimentos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('termos', 'privacidade', 'marketing') NOT NULL,
  versao VARCHAR(20) NOT NULL,
  aceito TINYINT(1) NOT NULL,
  ip VARCHAR(45) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_consentimentos_usuario (usuario_id, tipo),
  CONSTRAINT fk_consentimentos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE barbeiros (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  usuario_id BIGINT UNSIGNED NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_barbeiros_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE servicos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  descricao VARCHAR(255) NOT NULL DEFAULT '',
  preco_centavos INT UNSIGNED NOT NULL,
  duracao_min SMALLINT UNSIGNED NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ordem SMALLINT NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_servicos_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Faixas de atendimento por dia da semana (0 = domingo). Mais de uma faixa no dia = pausa entre elas.
CREATE TABLE horarios_funcionamento (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  barbeiro_id SMALLINT UNSIGNED NOT NULL,
  dia_semana TINYINT UNSIGNED NOT NULL,
  abre TIME NOT NULL,
  fecha TIME NOT NULL,
  KEY ix_horarios_barbeiro (barbeiro_id, dia_semana),
  CONSTRAINT fk_horarios_barbeiro FOREIGN KEY (barbeiro_id) REFERENCES barbeiros (id) ON DELETE CASCADE,
  CONSTRAINT ck_horarios_dia CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT ck_horarios_faixa CHECK (abre < fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE bloqueios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  barbeiro_id SMALLINT UNSIGNED NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NOT NULL,
  motivo VARCHAR(160) NOT NULL DEFAULT '',
  criado_por BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_bloqueios_barbeiro (barbeiro_id, inicio),
  CONSTRAINT fk_bloqueios_barbeiro FOREIGN KEY (barbeiro_id) REFERENCES barbeiros (id) ON DELETE CASCADE,
  CONSTRAINT ck_bloqueios_periodo CHECK (inicio < fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agendamentos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo CHAR(8) NOT NULL,
  cliente_id BIGINT UNSIGNED NULL,
  cliente_nome VARCHAR(120) NOT NULL,
  cliente_telefone VARCHAR(20) NULL,
  barbeiro_id SMALLINT UNSIGNED NOT NULL,
  servico_id INT UNSIGNED NOT NULL,
  servico_nome VARCHAR(80) NOT NULL,
  preco_centavos INT UNSIGNED NOT NULL,
  duracao_min SMALLINT UNSIGNED NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NOT NULL,
  status ENUM('confirmado', 'concluido', 'cancelado', 'faltou') NOT NULL DEFAULT 'confirmado',
  origem ENUM('app', 'admin') NOT NULL DEFAULT 'app',
  observacao VARCHAR(255) NULL,
  cancelado_por ENUM('cliente', 'admin') NULL,
  motivo_cancelamento VARCHAR(255) NULL,
  lembrete_24h_em DATETIME NULL,
  lembrete_2h_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agendamentos_codigo (codigo),
  KEY ix_agendamentos_barbeiro (barbeiro_id, inicio),
  KEY ix_agendamentos_cliente (cliente_id, inicio),
  KEY ix_agendamentos_status (status, inicio),
  CONSTRAINT fk_agendamentos_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_agendamentos_barbeiro FOREIGN KEY (barbeiro_id) REFERENCES barbeiros (id),
  CONSTRAINT fk_agendamentos_servico FOREIGN KEY (servico_id) REFERENCES servicos (id),
  CONSTRAINT ck_agendamentos_periodo CHECK (inicio < fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Uma linha por barbeiro e dia. Marcar ou remarcar trava esta linha com SELECT ... FOR UPDATE,
-- então dois pedidos para o mesmo dia passam um de cada vez e nunca gravam horários sobrepostos.
CREATE TABLE agenda_travas (
  barbeiro_id SMALLINT UNSIGNED NOT NULL,
  dia DATE NOT NULL,
  PRIMARY KEY (barbeiro_id, dia)
) ENGINE=InnoDB;

CREATE TABLE notificacoes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  corpo VARCHAR(500) NOT NULL,
  link VARCHAR(255) NULL,
  lida_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_notificacoes_usuario (usuario_id, criado_em),
  CONSTRAINT fk_notificacoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE push_inscricoes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  endpoint VARCHAR(700) NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY ix_push_usuario (usuario_id),
  CONSTRAINT fk_push_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Fila de saída de e-mails (outbox): gravada na mesma transação do evento, entregue depois com novas tentativas.
CREATE TABLE emails_saida (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  para VARCHAR(190) NOT NULL,
  assunto VARCHAR(200) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  texto TEXT NOT NULL,
  anexos JSON NULL,
  tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  proxima_tentativa_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_em DATETIME NULL,
  erro VARCHAR(500) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_emails_pendentes (enviado_em, proxima_tentativa_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE configuracoes (
  chave VARCHAR(60) PRIMARY KEY,
  valor JSON NOT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auditoria (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  acao VARCHAR(60) NOT NULL,
  alvo VARCHAR(120) NULL,
  detalhes JSON NULL,
  ip VARCHAR(45) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_auditoria_data (criado_em),
  KEY ix_auditoria_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
