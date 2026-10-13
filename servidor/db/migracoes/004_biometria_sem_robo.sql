-- Sai o robô do WhatsApp (lembretes voltam a ser só por e-mail; o Fortão fala com o cliente pelo próprio WhatsApp, pelo painel)
-- e entra o login com biometria (passkeys / WebAuthn).

DROP TABLE IF EXISTS whatsapp_saida;
DROP TABLE IF EXISTS whatsapp_recebidas;
ALTER TABLE agendamentos
  DROP COLUMN presenca_confirmada_em,
  DROP COLUMN whatsapp_lembrete;
-- O tipo 'whatsapp' continua no ENUM de consentimentos só para guardar o histórico de quem aceitou antes.

-- Identificador aleatório da conta para as passkeys (não leva e-mail nem o id interno para o aparelho)
ALTER TABLE usuarios ADD COLUMN biometria_id CHAR(22) CHARACTER SET ascii NULL AFTER preferencias,
  ADD UNIQUE KEY uq_usuarios_biometria (biometria_id);

-- Uma linha por aparelho em que o cliente ativou a biometria. A digital ou o rosto nunca saem do aparelho:
-- aqui fica só a chave pública, que confere a assinatura feita por ele.
CREATE TABLE biometria_credenciais (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  credencial_id VARCHAR(1400) CHARACTER SET ascii NOT NULL,
  chave_publica BLOB NOT NULL,
  contador BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transportes VARCHAR(120) NULL,
  aparelho VARCHAR(60) NOT NULL,
  sincronizada TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso_em DATETIME NULL,
  UNIQUE KEY uq_biometria_credencial (credencial_id),
  KEY ix_biometria_usuario (usuario_id),
  CONSTRAINT fk_biometria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Desafios de uso único (5 min): só o hash fica guardado
CREATE TABLE biometria_desafios (
  desafio_hash CHAR(64) PRIMARY KEY,
  tipo ENUM('cadastro', 'entrada') NOT NULL,
  usuario_id BIGINT UNSIGNED NULL,
  expira_em DATETIME NOT NULL,
  KEY ix_biometria_desafios_expira (expira_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
