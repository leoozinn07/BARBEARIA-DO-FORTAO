# Colocar no ar

O jeito mais simples: um servidor VPS com Docker. O `docker-compose.yml` sobe o MySQL, o app e o Caddy, que cuida do HTTPS sozinho.

## 1. O que você precisa

| Item | Sugestão | Custo aproximado |
| --- | --- | --- |
| Domínio | registro.br (`barbeariadofortao.com.br`) | R$ 40 por ano |
| Servidor | VPS com 2 GB de RAM (Hostinger, Contabo, DigitalOcean, Magalu Cloud) | R$ 30 a R$ 60 por mês |
| E-mail de envio | Brevo (300 e-mails por dia grátis) ou Resend | grátis no começo |

## 2. Domínio

No painel do domínio, crie um registro **A** apontando `barbeariadofortao.com.br` e `www` para o IP do servidor.

## 3. Servidor

```bash
# No servidor (Ubuntu), uma vez
curl -fsSL https://get.docker.com | sh
git clone https://github.com/leoozinn07/BARBEARIA-DO-FORTAO.git
cd BARBEARIA-DO-FORTAO
cp .env.example .env
nano .env
```

No `.env`, preencha no mínimo:

- `DOMINIO` e `APP_URL=https://seu-dominio`
- `MYSQL_SENHA` e `MYSQL_SENHA_ROOT` (senhas longas e diferentes)
- `SMTP_*` e `EMAIL_REMETENTE` (veja a seção 4)
- `EMAIL_ADMIN` com o e-mail do Fortão
- `VAPID_PUBLICA` e `VAPID_PRIVADA` (veja a seção 5)

```bash
docker compose up -d --build
docker compose exec app node scripts/criar-admin.js --email fortao@seuemail.com --nome "Fortão"
```

O comando mostra a senha gerada uma única vez. Entre em `https://seu-dominio/entrar` e o painel fica em `/admin`.

## 4. E-mail que chega na caixa de entrada

1. Crie a conta no Brevo (ou outro provedor) e cadastre o domínio.
2. Adicione no registro.br os registros **SPF**, **DKIM** e **DMARC** que o provedor mostrar. Sem eles, os lembretes caem no spam.
3. Copie host, porta, usuário e senha SMTP para o `.env` e reinicie: `docker compose restart app`.

## 5. Notificações push

```bash
docker compose exec app node scripts/gerar-vapid.js
```

Cole as duas linhas no `.env` e reinicie o app. Sem as chaves, o resto funciona e só o push fica desligado.

## 6. Backup do banco

Rode todo dia, por exemplo com o `cron` do servidor:

```bash
docker compose exec -T banco sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" fortao' | gzip > backup-$(date +%F).sql.gz
```

Guarde as cópias fora do servidor (Google Drive, outro provedor).

## 7. Atualizar o app

```bash
git pull
docker compose up -d --build
```

As migrações novas do banco rodam sozinhas ao subir.

## Sem Docker

Também funciona em qualquer hospedagem com Node 22 e MySQL 8: `npm ci --omit=dev`, configure o `.env` e rode `npm start` atrás de um proxy com HTTPS (Nginx ou Caddy). Use `CONFIAR_PROXY=1` para os limites por IP enxergarem o IP real do cliente.
