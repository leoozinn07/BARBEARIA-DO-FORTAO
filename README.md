# Barbearia do Fortão

App de agendamento da Barbearia do Fortão, na Cohab 5 (São Paulo). Funciona como site e como app Android na Play Store, com contas por e-mail e senha, painel do Fortão, lembretes por e-mail e notificações no celular.

![Telas do app](docs/previas/visao-geral.jpg)

## O que já funciona

- **Cliente:** cria conta, marca em 3 toques (serviço, dia, horário), recebe confirmação por e-mail com convite de agenda, lembrete 24 h e 2 h antes, remarca e cancela pelo app, vê avisos no sino, escolhe tema escuro ou claro e letra grande.
- **Fortão (admin):** agenda do dia com concluir, falta, remarcar e cancelar; marca cliente avulso do WhatsApp ou do balcão; fecha a agenda em folgas; edita serviços, preços, horário de funcionamento e dados da barbearia; busca clientes; vê o resumo do dia, da semana e do mês.
- **Segurança:** senha com argon2id, sessão em cookie HttpOnly, proteção CSRF, limite de tentativas, bloqueio da conta após 8 senhas erradas, CSP sem script inline, nenhum horário duplicado mesmo com pedidos simultâneos.
- **LGPD:** aceite registrado com versão, só cookies essenciais, fontes e ícones servidos pelo próprio site, mapa do Google só depois do toque, baixar e excluir os dados pelo app, termos, privacidade e página de direitos do titular.

## Catálogo inicial

| Serviço | Preço | Duração |
| --- | --- | --- |
| Corte Fortão | R$ 40 | 40 min |
| Corte e sobrancelha | R$ 45 | 45 min |
| Corte e barba | R$ 50 | 60 min |

Preço, duração e serviços novos se mudam pelo painel.

## Rodar no computador

Precisa de Node 22 e MySQL 8.

```bash
# 1. Banco
mysql -uroot -e "CREATE DATABASE fortao CHARACTER SET utf8mb4; CREATE USER 'fortao'@'localhost' IDENTIFIED BY 'fortao_dev'; GRANT ALL ON fortao.* TO 'fortao'@'localhost';"

# 2. Configuração
cp .env.example .env        # ajuste NODE_ENV=development, APP_URL=http://localhost:3000 e a senha do MySQL

# 3. Instalar e criar o admin
npm install
npm run admin:criar -- --email fortao@seuemail.com --nome "Fortão"

# 4. Subir
npm run dev                 # http://localhost:3000
```

As tabelas são criadas sozinhas na primeira vez. Sem SMTP configurado, os e-mails ficam salvos em `var/emails/` para você abrir no navegador.

## Testes

```bash
# Banco de teste (uma vez)
mysql -uroot -e "CREATE DATABASE fortao_teste; GRANT ALL ON fortao_teste.* TO 'fortao'@'localhost';"

npm test       # 40 testes de API contra MySQL real
npm run lint   # ESLint
npm run e2e    # fluxo completo no navegador (com o servidor rodando)
```

## Estrutura

```
servidor/
  app.js, index.js       Express: segurança, páginas, API, rotinas
  db/                    conexão, migrações SQL, carga inicial
  rotas/                 públicas, contas, área do cliente, painel
  servicos/              agenda, eventos, push, lembretes, configurações
  emails/                modelos e fila de envio com novas tentativas
  middlewares/           sessão, CSRF, limites, cabeçalhos, erros
  partes/                cabeçalho, abas e rodapé compartilhados
publico/                 páginas HTML, CSS, JS, fontes, ícones, PWA
scripts/                 criar admin, gerar chaves push, gerar ícones
testes/                  testes de API e fluxo no navegador
docs/                    especificação, deploy, Play Store, melhorias, prévias
prototipos/              as três opções de landing da etapa 1
```

## Próximos passos

1. Preencher endereço, WhatsApp, Instagram e dados da empresa no painel (aba Barbearia).
2. Colocar no ar: [docs/deploy.md](docs/deploy.md).
3. Publicar na Play Store: [docs/play-store.md](docs/play-store.md).
4. Escolher melhorias: [docs/melhorias.md](docs/melhorias.md).

Os textos de termos, privacidade e LGPD são um modelo bem completo, mas precisam da revisão de um advogado antes do lançamento.
