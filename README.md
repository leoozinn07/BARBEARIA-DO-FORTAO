# Barbearia do Fortão

Site de agendamento da Barbearia do Fortão, na Cohab 5 (São Paulo). O cliente marca corte e serviços de cabelo pelo site e paga na barbearia. O Fortão tem um painel para tocar a agenda, mudar preços e serviços e ver o rendimento. O banco de dados fica no Supabase.

![Telas do site](docs/previas/visao-geral.jpg)

## O que funciona

- **Cliente:** cria conta, marca em 3 toques (serviço, dia, horário), vê o preço antes de confirmar, recebe confirmação por e-mail com convite de agenda, lembrete 24 h e 2 h antes, remarca e cancela pelo site, vê avisos no sino, escolhe tema escuro ou claro e letra grande.
- **Fortão (admin):** agenda do dia com concluir, falta, remarcar e cancelar; marca cliente do WhatsApp ou do balcão; fecha a agenda em folgas; cria, edita, esconde e remove serviços e preços; muda horário de funcionamento e dados da barbearia; busca clientes.
- **Rendimento:** quanto entrou (horários concluídos), quanto ainda vai entrar (confirmados), atendimentos, ticket médio e faltas, com gráfico por dia ou por mês, divisão por serviço, tabela e comparação com o período anterior.
- **Sem pagamento online:** o preço aparece antes de confirmar e é pago na barbearia.
- **Visual:** preto e cinza, ilustrações próprias de ferramentas de barbeiro e dourado só em detalhes. Ao tocar em qualquer botão ou caixa, aparece um contorno dourado.
- **Segurança:** banco no Supabase com tabelas fora da API pública e RLS ligado, conexão criptografada com certificado conferido, senha com argon2id, sessão em cookie HttpOnly, proteção CSRF, limite de tentativas, CSP sem script inline e nenhum horário duplicado (o próprio banco recusa sobreposição).
- **LGPD:** aceite registrado com versão, só cookies essenciais, mapa do Google só depois do toque, baixar e excluir os dados pela conta, termos, privacidade e página de direitos do titular.

## Catálogo inicial

| Serviço | Preço | Duração |
| --- | --- | --- |
| Corte Fortão | R$ 40 | 40 min |
| Corte e sobrancelha | R$ 45 | 45 min |
| Corte e barba | R$ 50 | 60 min |

Preços, durações e serviços novos se mudam no painel, aba Serviços. Mudar um preço não altera horários já marcados.

## Banco de dados (Supabase)

O projeto **barbearia-do-fortao** (região São Paulo) já está criado na sua conta do Supabase, com as tabelas, as proteções e o catálogo inicial. Para o site se conectar:

1. No Supabase, abra o projeto e vá em **Connect**. Copie a conexão **Session pooler** e troque `[YOUR-PASSWORD]` pela senha do banco (se não lembrar, gere outra em **Project Settings > Database > Reset database password**).
2. Em **Database > Settings > SSL Configuration**, baixe o certificado e salve como `certs/supabase-ca.crt`.
3. Coloque a conexão em `DATABASE_URL` no `.env` (modelo em `.env.example`).

O site nunca usa as chaves `anon` ou `service_role`: só o servidor fala com o banco, pela senha.

## Rodar no computador

Precisa de Node 22 e da `DATABASE_URL` do Supabase (ou de um Postgres local).

```bash
cp .env.example .env        # ajuste NODE_ENV=development, APP_URL=http://localhost:3000 e a DATABASE_URL
npm install
npm run admin:criar -- --email fortao@seuemail.com --nome "Fortão"
npm run dev                 # http://localhost:3000
```

As tabelas são criadas sozinhas na primeira vez (no Supabase elas já existem). Sem SMTP configurado, os e-mails ficam salvos em `var/emails/` e o painel avisa.

Para conferir o código: `npm run lint`.

## Estrutura

```
servidor/
  app.js, index.js       Express: segurança, páginas, API, rotinas
  db/                    conexão com o Postgres, migrações SQL, carga inicial
  rotas/                 públicas, contas, área do cliente, painel (com rendimento)
  servicos/              agenda, eventos, lembretes, configurações
  emails/                modelos e fila de envio com novas tentativas
  middlewares/           sessão, CSRF, limites, cabeçalhos, erros
  partes/                cabeçalho, abas e rodapé compartilhados
publico/                 páginas HTML, CSS, JS, fontes, ícones e ilustrações
scripts/                 criar o admin
docs/                    especificação, deploy, melhorias, prévias
```

## Próximos passos

1. Ligar o site ao Supabase (seção acima) e colocar no ar: [docs/deploy.md](docs/deploy.md).
2. Preencher endereço, WhatsApp, Instagram e dados da empresa no painel (aba Barbearia).
3. Escolher melhorias: [docs/melhorias.md](docs/melhorias.md).

Os textos de termos, privacidade e LGPD são um modelo bem completo, mas precisam da revisão de um advogado antes do lançamento.
