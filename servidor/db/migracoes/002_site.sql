-- Site sem app: as notificações push saem e os horários marcados pelo cliente passam a ter origem "site".
-- Também ganha um índice por data, usado pelo rendimento do painel.

DROP TABLE IF EXISTS push_inscricoes;

ALTER TABLE agendamentos MODIFY origem ENUM('app', 'site', 'admin') NOT NULL DEFAULT 'site';
UPDATE agendamentos SET origem = 'site' WHERE origem = 'app';
ALTER TABLE agendamentos MODIFY origem ENUM('site', 'admin') NOT NULL DEFAULT 'site';

CREATE INDEX ix_agendamentos_inicio ON agendamentos (inicio);
