# Barbearia do Fortão

Site de agendamento da Barbearia do Fortão, na Cohab 5 (São Paulo). O cliente marca corte e serviços de cabelo pelo site e paga na barbearia. O Fortão tem um painel para tocar a agenda, mudar preços e serviços e ver o rendimento. Feito em HTML, CSS e JavaScript, com Node e MySQL.

![Telas do site](docs/previas/visao-geral.jpg)

<sub>Prévias tiradas de um banco local com horários de exemplo. Um banco novo começa vazio, só com os serviços e os horários de funcionamento.</sub>

## O que funciona

- **Cliente:** cria conta, escolhe o serviço, se quiser soma adicionais (luzes, boyzão, progressiva), escolhe dia e horário e vê o total antes de marcar. Antes de confirmar aparece "Tem certeza e consciência de que esse será o horário agendado?", com o mini formulário do celular (WhatsApp). Depois de marcar, adiciona o lembrete na agenda do celular ou no Google Agenda. No perfil vê o próximo horário, remarca e cancela até 2 horas antes.
- **Entrar com biometria:** quem já tem conta ativa no perfil e passa a entrar com a digital, o rosto ou o PIN do celular, sem digitar a senha (passkeys, padrão WebAuthn). A biometria nunca sai do aparelho: o site guarda só uma chave pública.
- **Lembretes por e-mail (grátis):** confirmação na hora, lembrete 1 dia antes e 2 horas antes, aviso de remarcação e cancelamento, tudo também no sino do site.
- **Fortão (admin):** agenda do dia com concluir, falta, remarcar e cancelar; botão **Mensagem** em cada horário e em cada cliente, que abre o WhatsApp dele com o texto pronto (lembrete, confirmar presença, remarcado, cancelado ou livre), e **Salvar contato**, que põe o cliente na agenda do celular; marca cliente do WhatsApp ou do balcão (com adicionais); fecha a agenda em folgas; cria, edita, esconde e remove serviços e adicionais com preço e tempo; muda horário de funcionamento e dados da barbearia; busca clientes.
- **Rendimento:** quanto entrou (horários concluídos), quanto ainda vai entrar (confirmados), atendimentos, ticket médio e faltas, com gráfico por dia ou por mês, divisão por serviço e por adicional, tabela e comparação com o período anterior.
- **Sem pagamento online:** o preço aparece antes de confirmar e é pago na barbearia.
- **Visual:** preto e cinza, botão de tema claro e escuro no topo de todas as páginas e dourado só em detalhes. O banner da barbearia abre a página inicial e a ilustração do corte é a capa da página de marcar. Ao tocar em qualquer botão ou caixa, aparece um contorno dourado.
- **Boas-vindas:** ao criar a conta, o cliente vê a animação "Bem-vindo ao seu lar, *nome*"; quando entra de novo (com senha ou biometria), "Fortaleça sua autoestima novamente, *nome*". Um toque pula, e quem pede menos movimento no celular vê só o texto.
- **Segurança:** senha com argon2id, sessão em cookie HttpOnly, proteção CSRF, limite de tentativas, bloqueio da conta após 8 senhas erradas, CSP sem script inline, MySQL fechado para a internet no Docker, biometria que pede a senha (ou um login recente) para ser ativada e avisa por e-mail, e nenhum horário duplicado mesmo com pedidos simultâneos.
- **Termos e privacidade:** termos de uso, política de privacidade e página de direitos (LGPD) no rodapé de todas as páginas, no cadastro, na tela de entrar e na confirmação do horário. Aceite registrado com versão, só cookies essenciais, mapa do Google só depois do toque, baixar e excluir os dados pela conta.

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

Cliente nunca vê o painel: as rotas de admin conferem o papel da conta no servidor. O Fortão também pode ativar a biometria em Minha conta > Perfil e entrar com a digital.

## Como o Fortão fala com o cliente

Ao marcar, o cliente informa o celular. No painel, cada horário e cada cliente têm:

- **Mensagem:** abre uma folha com textos prontos (lembrete, confirmar presença, remarcado, cancelado ou escrever) e o botão **Abrir no WhatsApp**, que leva para a conversa com o cliente no WhatsApp do próprio Fortão, já com o texto. Ele confere e envia. Não tem robô nem custo: é uma conversa normal.
- **Salvar contato:** baixa o contato do cliente (.vcf). No celular, abrir o arquivo leva direto para "Criar contato".

Quando o Fortão cancela ou remarca um cliente do balcão (sem e-mail), a mensagem de aviso já abre pronta.

## Lembretes

Confirmação, lembrete 1 dia antes e 2 horas antes, remarcação e cancelamento vão por **e-mail**, sem custo, pela **API do Brevo** (300 e-mails por dia no plano grátis). Basta colocar a chave em `BREVO_API_KEY` no `.env` ([docs/deploy.md](docs/deploy.md), seção 4). Enquanto ela não estiver lá, o painel avisa e os e-mails ficam salvos em `var/emails/`; se o Brevo recusar algum envio, o painel mostra o motivo.

## Entrar com biometria

1. O cliente entra uma vez com e-mail e senha.
2. Em Minha conta > Perfil > Entrar com biometria, toca em **Ativar neste aparelho** e confirma com a digital, o rosto ou o PIN. Logo depois de entrar não pede a senha de novo; mais tarde, pede.
3. Da próxima vez, na tela de entrar, toca em **Entrar com biometria**.

Funciona no Chrome (Android, Windows, Mac), no Safari (iPhone e Mac) e no Edge, sempre com HTTPS e no domínio principal. Cada aparelho aparece na lista do perfil e pode ser removido. A conta recebe um e-mail de aviso a cada aparelho ativado.

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

As tabelas são criadas sozinhas na primeira vez. Sem a chave do Brevo, os e-mails ficam salvos em `var/emails/` e o painel avisa.

Para conferir o código: `npm run lint`.

## Estrutura

```
servidor/
  app.js, index.js       Express: segurança, páginas, API, rotinas
  db/                    conexão com o MySQL, migrações SQL, carga inicial
  rotas/                 públicas, contas (com biometria), área do cliente, painel (com rendimento)
  servicos/              agenda, eventos, lembretes, biometria, configurações
  emails/                modelos e fila de envio com novas tentativas
  middlewares/           sessão, CSRF, limites, cabeçalhos, erros
  partes/                cabeçalho, abas e rodapé compartilhados
publico/                 páginas HTML, CSS, JS, fontes, ícones e ilustrações
scripts/                 criar o admin
docs/                    especificação, deploy, melhorias, prévias
```

## Próximos passos

1. Colocar no ar: [docs/deploy.md](docs/deploy.md).
2. Ligar o e-mail pela API do Brevo (grátis): [docs/deploy.md](docs/deploy.md), seção 4.
3. Preencher endereço, WhatsApp, Instagram e dados da empresa no painel (aba Barbearia).
4. Escolher melhorias: [docs/melhorias.md](docs/melhorias.md).

Os textos de termos, privacidade e LGPD são um modelo bem completo, mas precisam da revisão de um advogado antes do lançamento.
