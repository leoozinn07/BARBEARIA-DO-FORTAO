-- Esquema da Barbearia do Fortão (Postgres no Supabase).
--
-- Segurança:
-- * Tudo fica no schema "barbearia". A API automática do Supabase (PostgREST) só expõe "public",
--   então nenhuma tabela daqui é alcançável com a chave pública do projeto.
-- * RLS ligado em todas as tabelas, sem nenhuma política: os papéis anon e authenticated não leem nem gravam nada.
--   Só o servidor Node acessa, com o usuário dono das tabelas.
-- * Dois horários nunca se sobrepõem: o próprio banco recusa (restrição de exclusão no fim do arquivo).
--
-- Datas em timestamptz (UTC). Dinheiro em centavos.

DO $$
BEGIN
  -- No Supabase as extensões moram no schema "extensions"
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  END IF;
END $$;

-- Atualiza a coluna atualizado_em em todo UPDATE
CREATE FUNCTION barbearia.tocar_atualizado_em() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

CREATE TABLE barbearia.usuarios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome varchar(120) NOT NULL,
  email varchar(190) NOT NULL,
  telefone varchar(20),
  senha_hash varchar(255) NOT NULL,
  papel text NOT NULL DEFAULT 'cliente',
  email_verificado_em timestamptz,
  marketing boolean NOT NULL DEFAULT false,
  preferencias jsonb,
  tentativas_falhas smallint NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  excluido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT ck_usuarios_email_minusculo CHECK (email = lower(email)),
  CONSTRAINT ck_usuarios_papel CHECK (papel IN ('cliente', 'admin'))
);

CREATE TABLE barbearia.sessoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES barbearia.usuarios (id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
  ip varchar(45),
  agente varchar(255),
  CONSTRAINT uq_sessoes_token UNIQUE (token_hash)
);
CREATE INDEX ix_sessoes_usuario ON barbearia.sessoes (usuario_id);
CREATE INDEX ix_sessoes_expira ON barbearia.sessoes (expira_em);

CREATE TABLE barbearia.tokens_uso_unico (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES barbearia.usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  token_hash char(64) NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tokens_hash UNIQUE (token_hash),
  CONSTRAINT ck_tokens_tipo CHECK (tipo IN ('verificar_email', 'redefinir_senha'))
);
CREATE INDEX ix_tokens_usuario ON barbearia.tokens_uso_unico (usuario_id, tipo);

CREATE TABLE barbearia.consentimentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES barbearia.usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  versao varchar(20) NOT NULL,
  aceito boolean NOT NULL,
  ip varchar(45),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_consentimentos_tipo CHECK (tipo IN ('termos', 'privacidade', 'marketing'))
);
CREATE INDEX ix_consentimentos_usuario ON barbearia.consentimentos (usuario_id, tipo);

CREATE TABLE barbearia.barbeiros (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome varchar(80) NOT NULL,
  usuario_id bigint REFERENCES barbearia.usuarios (id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX ix_barbeiros_usuario ON barbearia.barbeiros (usuario_id);

CREATE TABLE barbearia.servicos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug varchar(60) NOT NULL,
  nome varchar(80) NOT NULL,
  descricao varchar(255) NOT NULL DEFAULT '',
  preco_centavos integer NOT NULL,
  duracao_min smallint NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem smallint NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_servicos_slug UNIQUE (slug),
  CONSTRAINT ck_servicos_preco CHECK (preco_centavos >= 0),
  CONSTRAINT ck_servicos_duracao CHECK (duracao_min BETWEEN 5 AND 480)
);

-- Faixas de atendimento por dia da semana (0 = domingo). Mais de uma faixa no dia = pausa entre elas.
CREATE TABLE barbearia.horarios_funcionamento (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barbeiro_id integer NOT NULL REFERENCES barbearia.barbeiros (id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL,
  abre time NOT NULL,
  fecha time NOT NULL,
  CONSTRAINT ck_horarios_dia CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT ck_horarios_faixa CHECK (abre < fecha)
);
CREATE INDEX ix_horarios_barbeiro ON barbearia.horarios_funcionamento (barbeiro_id, dia_semana);

CREATE TABLE barbearia.bloqueios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barbeiro_id integer NOT NULL REFERENCES barbearia.barbeiros (id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  motivo varchar(160) NOT NULL DEFAULT '',
  criado_por bigint REFERENCES barbearia.usuarios (id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_bloqueios_periodo CHECK (inicio < fim)
);
CREATE INDEX ix_bloqueios_barbeiro ON barbearia.bloqueios (barbeiro_id, inicio);
CREATE INDEX ix_bloqueios_criado_por ON barbearia.bloqueios (criado_por);

-- Nome, serviço e preço são copiados no momento da marcação: mudar o preço depois não altera o que já foi marcado
-- e o rendimento de cada mês continua certo.
CREATE TABLE barbearia.agendamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo char(8) NOT NULL,
  cliente_id bigint REFERENCES barbearia.usuarios (id) ON DELETE SET NULL,
  cliente_nome varchar(120) NOT NULL,
  cliente_telefone varchar(20),
  barbeiro_id integer NOT NULL REFERENCES barbearia.barbeiros (id),
  servico_id integer NOT NULL REFERENCES barbearia.servicos (id),
  servico_nome varchar(80) NOT NULL,
  preco_centavos integer NOT NULL,
  duracao_min smallint NOT NULL,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmado',
  origem text NOT NULL DEFAULT 'site',
  observacao varchar(255),
  cancelado_por text,
  motivo_cancelamento varchar(255),
  lembrete_24h_em timestamptz,
  lembrete_2h_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agendamentos_codigo UNIQUE (codigo),
  CONSTRAINT ck_agendamentos_periodo CHECK (inicio < fim),
  CONSTRAINT ck_agendamentos_status CHECK (status IN ('confirmado', 'concluido', 'cancelado', 'faltou')),
  CONSTRAINT ck_agendamentos_origem CHECK (origem IN ('site', 'admin')),
  CONSTRAINT ck_agendamentos_cancelado_por CHECK (cancelado_por IS NULL OR cancelado_por IN ('cliente', 'admin')),
  -- A cadeira não tem dois clientes ao mesmo tempo. Horário cancelado libera a vaga.
  CONSTRAINT ex_agendamentos_sem_sobreposicao EXCLUDE USING gist (
    barbeiro_id WITH =,
    tstzrange(inicio, fim) WITH &&
  ) WHERE (status <> 'cancelado')
);
CREATE INDEX ix_agendamentos_barbeiro ON barbearia.agendamentos (barbeiro_id, inicio);
CREATE INDEX ix_agendamentos_cliente ON barbearia.agendamentos (cliente_id, inicio);
CREATE INDEX ix_agendamentos_status ON barbearia.agendamentos (status, inicio);
CREATE INDEX ix_agendamentos_servico ON barbearia.agendamentos (servico_id);

CREATE TABLE barbearia.notificacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES barbearia.usuarios (id) ON DELETE CASCADE,
  tipo varchar(40) NOT NULL,
  titulo varchar(120) NOT NULL,
  corpo varchar(500) NOT NULL,
  link varchar(255),
  lida_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notificacoes_usuario ON barbearia.notificacoes (usuario_id, criado_em);

-- Fila de saída de e-mails (outbox): gravada na mesma transação do evento, entregue depois com novas tentativas.
CREATE TABLE barbearia.emails_saida (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  para varchar(190) NOT NULL,
  assunto varchar(200) NOT NULL,
  html text NOT NULL,
  texto text NOT NULL,
  anexos jsonb,
  tentativas smallint NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  erro varchar(500),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_emails_pendentes ON barbearia.emails_saida (proxima_tentativa_em) WHERE enviado_em IS NULL;

CREATE TABLE barbearia.configuracoes (
  chave varchar(60) PRIMARY KEY,
  valor jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE barbearia.auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint,
  acao varchar(60) NOT NULL,
  alvo varchar(120),
  detalhes jsonb,
  ip varchar(45),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_data ON barbearia.auditoria (criado_em);
CREATE INDEX ix_auditoria_usuario ON barbearia.auditoria (usuario_id);

CREATE TRIGGER tg_usuarios_atualizado BEFORE UPDATE ON barbearia.usuarios FOR EACH ROW EXECUTE FUNCTION barbearia.tocar_atualizado_em();
CREATE TRIGGER tg_servicos_atualizado BEFORE UPDATE ON barbearia.servicos FOR EACH ROW EXECUTE FUNCTION barbearia.tocar_atualizado_em();
CREATE TRIGGER tg_agendamentos_atualizado BEFORE UPDATE ON barbearia.agendamentos FOR EACH ROW EXECUTE FUNCTION barbearia.tocar_atualizado_em();
CREATE TRIGGER tg_configuracoes_atualizado BEFORE UPDATE ON barbearia.configuracoes FOR EACH ROW EXECUTE FUNCTION barbearia.tocar_atualizado_em();

-- ------------------------------------------------------------------ portas fechadas
DO $$
DECLARE
  tabela text;
BEGIN
  FOR tabela IN SELECT tablename FROM pg_tables WHERE schemaname = 'barbearia' LOOP
    EXECUTE format('ALTER TABLE barbearia.%I ENABLE ROW LEVEL SECURITY', tabela);
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA barbearia FROM PUBLIC;
REVOKE ALL ON FUNCTION barbearia.tocar_atualizado_em() FROM PUBLIC;

DO $$
BEGIN
  -- Papéis que o Supabase usa na API pública. Fora do Supabase eles não existem e este bloco não faz nada.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA barbearia FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA barbearia FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA barbearia FROM anon, authenticated;
    REVOKE ALL ON SCHEMA barbearia FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA barbearia REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA barbearia REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA barbearia REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
