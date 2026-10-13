# Barbearia do Fortão

Site de agendamento da Barbearia do Fortão, na Cohab 5 (São Paulo). O cliente marca corte e serviços de cabelo pelo site e paga na barbearia. O Fortão tem um painel para tocar a agenda, mudar preços e serviços e ver o rendimento. Feito em HTML, CSS e JavaScript, com Node e MySQL.

![Telas do site](docs/previas/visao-geral.jpg)

<sub>Prévias tiradas de um banco local com horários de exemplo. Um banco novo começa vazio, só com os serviços e os horários de funcionamento.</sub>

## O que funciona

- **Cliente:** cria conta, escolhe o serviço, se quiser soma adicionais (luzes, boyzão, progressiva), escolhe dia e horário e vê o total antes de marcar. Antes de confirmar aparece "Tem certeza e consciência de que esse será o horário agendado?", com o mini formulário do WhatsApp. Depois de marcar, adiciona o lembrete na agenda do celular ou no Google Agenda. No perfil vê o próximo horário, remarca e cancela até 2 horas antes.
- **WhatsApp:** confirmação na hora, lembrete 1 dia antes e 2 horas antes, aviso de remarcação e cancelamento. O cliente responde 1 para confirmar presença ou 2 para cancelar, e um robô atende ([docs/whatsapp.md](docs/whatsapp.md)).
- **Fortão (admin):** agenda do dia com concluir, falta, remarcar e cancelar; marca cliente do WhatsApp ou do balcão (com adicionais); fecha a agenda em folgas; cria, edita, esconde e remove serviços e adicionais com preço e tempo; muda horário de funcionamento e dados da barbearia; busca clientes.
- **Rendimento:** quanto entrou (horários concluídos), quanto ainda vai entrar (confirmados), atendimentos, ticket médio e faltas, com gráfico por dia ou por mês, divisão por serviço e por adicional, tabela e comparação com o período anterior.
- **Sem pagamento online:** o preço aparece antes de confirmar e é pago na barbearia.
- **Visual:** preto e cinza, botão de tema claro e escuro no topo de todas as páginas, ilustrações próprias de ferramentas de barbeiro e dourado só em detalhes. Ao tocar em qualquer botão ou caixa, aparece um contorno dourado.
- **Segurança:** senha com argon2id, sessão em cookie HttpOnly, proteção CSRF, limite de tentativas, bloqueio da conta após 8 senhas erradas, CSP sem script inline, MySQL fechado para a internet no Docker, webhook do WhatsApp com assinatura conferida e nenhum horário duplicado mesmo com pedidos simultâneos.
- **LGPD:** aceite registrado com versão (inclusive o do WhatsApp), só cookies essenciais, mapa do Google só depois do toque, baixar e excluir os dados pela conta, termos, privacidade e página de direitos do titular.

## Catálogo inicial

Terça a sexta das 9h às 20h, sábado das 8h às 18h. Domingo e segunda: fechado.

| Serviço | Preço | Duração |
| --- | --- | --- |
| Corte navalhado | R$ 45 | 45 min |
| Corte normal | R$ 40 | 40 min |
| Corte + sobrancelha | R$ 45 | 45 min |
| Corte + sobrancelha + barba | R$ 60 | 70 min |
| Corte + barba | R$ 50 | 60 min |

| Adicional (soma ao corte) | Preço | Tempo a mais |
| --- | --- | --- |
| Luzes | + R$ 60 | 60 min |
| Boyzão | + R$ 30 | 30 min |
| Progressiva | + R$ 80 | 90 min |

Preços e tempos são um ponto de partida: o Fortão muda tudo no painel, aba Serviços, e cria serviços ou adicionais novos quando quiser. Mudar um preço não altera horários já marcados.

## Como o Fortão entra no painel

1. Uma vez, no servidor, crie a conta dele (troque pelo e-mail que ele usa):

   ```bash
   npm run admin:criar -- --email fortao@seuemail.com --nome "Fortão"
   # no Docker: docker compose exec app node scripts/criar-admin.js --email fortao@seuemail.com --nome "Fortão"
   ```

   O comando mostra uma senha forte uma única vez. Para escolher a senha, acrescente `--senha "SuaSenhaForte!2026"`.
2. O Fortão abre o site, toca em **Entrar** (ícone de pessoa no topo) e entra com esse e-mail e senha.
3. O painel fica em **/admin**. No celular, a aba "Horários" de baixo vira "Painel"; no computador, aparece o link **Painel** no topo.
4. Para trocar a senha depois: Minha conta > Perfil > Trocar senha. Esqueceu? "Esqueci a senha" na tela de entrar manda um link por e-mail. Rodar o comando de novo com o mesmo e-mail também define uma senha nova.

Cliente nunca vê o painel: as rotas de admin conferem o papel da conta no servidor.

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
  rotas/                 públicas, contas, área do cliente, painel (com rendimento), webhook do WhatsApp
  servicos/              agenda, eventos, lembretes, configurações
  emails/                modelos e fila de envio com novas tentativas
  whatsapp/              fila, mensagens e robô do WhatsApp
  middlewares/           sessão, CSRF, limites, cabeçalhos, erros
  partes/                cabeçalho, abas e rodapé compartilhados
publico/                 páginas HTML, CSS, JS, fontes, ícones e ilustrações
scripts/                 criar o admin
docs/                    especificação, deploy, WhatsApp, melhorias, prévias
```

## Próximos passos

1. Colocar no ar: [docs/deploy.md](docs/deploy.md).
2. Preencher endereço, WhatsApp, Instagram e dados da empresa no painel (aba Barbearia).
3. Ligar o WhatsApp: [docs/whatsapp.md](docs/whatsapp.md).
4. Escolher melhorias: [docs/melhorias.md](docs/melhorias.md).

Os textos de termos, privacidade e LGPD são um modelo bem completo, mas precisam da revisão de um advogado antes do lançamento.
