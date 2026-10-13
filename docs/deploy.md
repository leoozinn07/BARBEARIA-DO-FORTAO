# Colocar o site no ar

O site é um servidor Node que fica ligado o tempo todo (ele manda os lembretes e entrega os e-mails). O banco já está no Supabase. Falta escolher onde o Node vai rodar.

## 1. O que você precisa

| Item | Sugestão | Custo aproximado |
| --- | --- | --- |
| Banco de dados | Supabase, projeto **barbearia-do-fortao** (já criado, plano grátis) | grátis |
| Hospedagem do site | Render ou Railway (mais simples) ou um VPS com Docker | US$ 5 a 7 por mês, ou R$ 30 a 60 no VPS |
| Domínio | registro.br (`barbeariadofortao.com.br`) | R$ 40 por ano |
| E-mail de envio | Brevo (300 e-mails por dia grátis) ou Resend | grátis no começo |

Evite planos que "dormem" quando ninguém acessa (como o grátis do Render): dormindo, os lembretes não saem.

## 2. Conexão com o Supabase

1. Abra o projeto **barbearia-do-fortao** no Supabase.
2. **Connect > Session pooler**: copie a conexão. Ela tem este formato:
   `postgresql://postgres.finqfiyylpkjsktjvcxa:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
   Use a do painel, que já vem com o endereço certo.
3. Troque `[YOUR-PASSWORD]` pela senha do banco. Esqueceu? **Project Settings > Database > Reset database password**.
4. **Database > Settings > SSL Configuration > Download certificate**. Salve como `certs/supabase-ca.crt`.

Use o *Session pooler* (porta 5432), que funciona em qualquer hospedagem. O *Transaction pooler* (porta 6543) não serve para este site.

## 3. Variáveis de ambiente

No painel da hospedagem (ou no `.env` do VPS), preencha:

| Variável | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://seu-dominio` |
| `DATABASE_URL` | a conexão do passo 2, com a senha |
| `DATABASE_CA` | `certs/supabase-ca.crt` |
| `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE` | dados do provedor de e-mail (seção 6) |
| `EMAIL_ADMIN` | e-mail do Fortão, recebe aviso de cada horário novo |

O certificado é público (não é senha) e pode ir junto com o código na pasta `certs/`. A senha do banco nunca vai para o GitHub: só no `.env` ou no painel da hospedagem.

## 4a. Render ou Railway

1. Crie um *Web Service* ligado a este repositório (branch principal).
2. Comando de instalação: `npm ci --omit=dev`. Comando de início: `npm start`.
3. Cole as variáveis da seção 3. Em `CONFIAR_PROXY`, use `1`.
4. Ligue o domínio próprio no painel da hospedagem; o HTTPS é automático.

## 4b. VPS com Docker

```bash
# No servidor (Ubuntu), uma vez
curl -fsSL https://get.docker.com | sh
git clone https://github.com/leoozinn07/BARBEARIA-DO-FORTAO.git
cd BARBEARIA-DO-FORTAO
cp .env.example .env && nano .env     # variáveis da seção 3 e DOMINIO
# copie o certificado para certs/supabase-ca.crt
docker compose up -d --build
```

No registro do domínio, aponte `seu-dominio` e `www` (registro **A**) para o IP do servidor. O Caddy cuida do HTTPS sozinho.

## 5. Criar a conta do Fortão

Rode uma vez, de qualquer lugar com a `DATABASE_URL` configurada (o seu computador serve):

```bash
npm run admin:criar -- --email fortao@seuemail.com --nome "Fortão"
```

No Docker: `docker compose exec app node scripts/criar-admin.js --email fortao@seuemail.com --nome "Fortão"`.

A senha aparece uma única vez. Entre em `https://seu-dominio/entrar`; o painel fica em `/admin`.

## 6. E-mail que chega na caixa de entrada

1. Crie a conta no Brevo (ou outro provedor) e cadastre o domínio.
2. Adicione no registro.br os registros **SPF**, **DKIM** e **DMARC** que o provedor mostrar. Sem eles, os lembretes caem no spam.
3. Coloque host, porta, usuário e senha SMTP nas variáveis e reinicie o site.

Enquanto o SMTP não estiver configurado, o painel mostra um aviso e os avisos aparecem só no sino do site.

## 7. Cópia de segurança

No plano grátis do Supabase, faça uma cópia por semana no seu computador:

```bash
pg_dump "$DATABASE_URL" --schema=barbearia --no-owner | gzip > backup-$(date +%F).sql.gz
```

Guarde as cópias fora do computador (Google Drive, HD externo). No plano pago, o Supabase faz cópias diárias sozinho.

## 8. Atualizar o site

Render e Railway publicam sozinhos a cada push no GitHub. No VPS:

```bash
git pull
docker compose up -d --build
```

Mudanças novas no banco (arquivos em `servidor/db/migracoes/`) rodam sozinhas ao subir.

## Boas práticas com o Supabase

- Não crie tabelas do site no schema `public`: lá elas ficariam visíveis pela API do Supabase.
- Não use nem publique as chaves `anon` e `service_role`; o site não precisa delas.
- O plano grátis pausa projetos parados por uma semana. Com o site no ar, ele conversa com o banco a cada minuto e não pausa.
