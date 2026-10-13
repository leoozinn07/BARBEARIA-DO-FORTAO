# Barbearia do Fortão

Site de agendamento da Barbearia do Fortão, na Cohab 5 (São Paulo). O cliente marca corte e serviços de cabelo pelo site e paga na barbearia. O Fortão tem um painel para tocar a agenda, mudar preços e serviços e ver o rendimento. Feito em HTML, CSS e JavaScript, com Node e MySQL.

![Telas do site](docs/previas/visao-geral.jpg)

<sub>Prévias tiradas de um banco local com horários de exemplo. Um banco novo começa vazio, só com os serviços e os horários de funcionamento.</sub>

## O que funciona

- **Cliente:** cria conta, marca em 3 toques (serviço, dia, horário), vê o preço antes de confirmar, recebe confirmação por e-mail com convite de agenda, lembrete 24 h e 2 h antes, remarca e cancela pelo site, vê avisos no sino, escolhe tema escuro ou claro e letra grande.
- **Fortão (admin):** agenda do dia com concluir, falta, remarcar e cancelar; marca cliente do WhatsApp ou do balcão; fecha a agenda em folgas; cria, edita, esconde e remove serviços e preços; muda horário de funcionamento e dados da barbearia; busca clientes.
- **Rendimento:** quanto entrou (horários concluídos), quanto ainda vai entrar (confirmados), atendimentos, ticket médio e faltas, com gráfico por dia ou por mês, divisão por serviço, tabela e comparação com o período anterior.
- **Sem pagamento online:** o preço aparece antes de confirmar e é pago na barbearia.
- **Visual:** preto e cinza, ilustrações próprias de ferramentas de barbeiro e dourado só em detalhes. Ao tocar em qualquer botão ou caixa, aparece um contorno dourado.
- **Segurança:** senha com argon2id, sessão em cookie HttpOnly, proteção CSRF, limite de tentativas, bloqueio da conta após 8 senhas erradas, CSP sem script inline, MySQL fechado para a internet no Docker e nenhum horário duplicado mesmo com pedidos simultâneos.
- **LGPD:** aceite registrado com versão, só cookies essenciais, mapa do Google só depois do toque, baixar e excluir os dados pela conta, termos, privacidade e página de direitos do titular.

## Catálogo inicial

| Serviço | Preço | Duração |
| --- | --- | --- |
| Corte Fortão | R$ 40 | 40 min |
| Corte e sobrancelha | R$ 45 | 45 min |
| Corte e barba | R$ 50 | 60 min |

Preços, durações e serviços novos se mudam no painel, aba Serviços. Mudar um preço não altera horários já marcados.

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

As tabelas são criadas sozinhas na primeira vez. Sem SMTP configurado, os e-mails ficam salvos em `var/emails/` e o painel avisa.

Para conferir o código: `npm run lint`.

## Estrutura

```
servidor/
  app.js, index.js       Express: segurança, páginas, API, rotinas
  db/                    conexão com o MySQL, migrações SQL, carga inicial
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

1. Colocar no ar: [docs/deploy.md](docs/deploy.md).
2. Preencher endereço, WhatsApp, Instagram e dados da empresa no painel (aba Barbearia).
3. Escolher melhorias: [docs/melhorias.md](docs/melhorias.md).

Os textos de termos, privacidade e LGPD são um modelo bem completo, mas precisam da revisão de um advogado antes do lançamento.
