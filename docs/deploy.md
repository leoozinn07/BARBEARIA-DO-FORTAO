# Colocar o site no ar

O jeito mais simples: um servidor VPS com Docker. O `docker-compose.yml` sobe o MySQL, o site e o Caddy, que cuida do HTTPS sozinho. O site precisa ficar ligado o tempo todo: é ele que manda os lembretes e entrega os e-mails.

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

```bash
docker compose up -d --build
docker compose exec app node scripts/criar-admin.js --email fortao@seuemail.com --nome "Fortão"
```

O comando mostra a senha gerada uma única vez. Entre em `https://seu-dominio/entrar` e o painel fica em `/admin`. As tabelas e o catálogo inicial são criados sozinhos na primeira vez.

## 4. E-mail que chega na caixa de entrada

1. Crie a conta no Brevo (ou outro provedor) e cadastre o domínio.
2. Adicione no registro.br os registros **SPF**, **DKIM** e **DMARC** que o provedor mostrar. Sem eles, os lembretes caem no spam.
3. Copie host, porta, usuário e senha SMTP para o `.env` e reinicie: `docker compose restart app`.

Enquanto o SMTP não estiver configurado, o painel mostra um aviso e os avisos aparecem só no sino do site.

## 5. Segurança do banco

- O MySQL do `docker-compose.yml` não abre porta para a internet: só o site, dentro do Docker, fala com ele.
- O site usa o usuário `fortao`, com acesso só ao banco `fortao`. A senha do `root` fica guardada para manutenção.
- Senhas, tokens de sessão e links de e-mail nunca ficam em texto puro no banco (argon2id e SHA-256).
- Nunca suba o `.env` para o GitHub.

## 6. Cópia de segurança

Rode todo dia, por exemplo com o `cron` do servidor:

```bash
docker compose exec -T banco sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction fortao' | gzip > backup-$(date +%F).sql.gz
```

Guarde as cópias fora do servidor (Google Drive, outro provedor).

## 7. Atualizar o site

```bash
git pull
docker compose up -d --build
```

As migrações novas do banco (arquivos em `servidor/db/migracoes/`) rodam sozinhas ao subir.

## Sem Docker

Também funciona em qualquer hospedagem com Node 22 e MySQL 8: `npm ci --omit=dev`, configure o `.env` e rode `npm start` atrás de um proxy com HTTPS (Nginx ou Caddy). Use `CONFIAR_PROXY=1` para os limites por IP enxergarem o IP real do cliente. Evite planos que "dormem" quando ninguém acessa: dormindo, os lembretes não saem.
