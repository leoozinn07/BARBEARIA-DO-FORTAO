# Colocar o site no ar

O jeito mais simples: um servidor VPS com Docker. O `docker-compose.yml` sobe o MySQL, o site e o Caddy, que cuida do HTTPS sozinho. O site precisa ficar ligado o tempo todo: é ele que manda os lembretes e entrega os e-mails. O Caddy também manda quem digitar `www.` para o domínio principal: a sessão e a biometria ficam presas a um endereço só.

## 1. O que você precisa

| Item | Sugestão | Custo aproximado |
| --- | --- | --- |
| Domínio | registro.br (`barbeariadofortao.com.br`) | R$ 40 por ano |
| Servidor | VPS com 2 GB de RAM (Hostinger, Contabo, DigitalOcean, Magalu Cloud) | R$ 30 a R$ 60 por mês |
| E-mail de envio (confirmação e lembretes) | API do Brevo (300 e-mails por dia grátis) | grátis |

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
- `BREVO_API_KEY` e `EMAIL_REMETENTE` (veja a seção 4)
- `EMAIL_ADMIN` com o e-mail do Fortão

```bash
docker compose up -d --build
docker compose exec app node scripts/criar-admin.js --email fortao@seuemail.com --nome "Fortão"
```

O comando mostra a senha gerada uma única vez. Entre em `https://seu-dominio/entrar` e o painel fica em `/admin`. As tabelas e o catálogo inicial são criados sozinhos na primeira vez.

## 4. E-mail pela API do Brevo (grátis)

Confirmação, lembretes (1 dia e 2 horas antes), remarcação, cancelamento e senha saem por e-mail. O jeito recomendado é a **API do Brevo**: grátis até 300 e-mails por dia e funciona mesmo em hospedagem que bloqueia as portas de SMTP (a DigitalOcean, por exemplo, bloqueia).

1. Crie a conta grátis em [brevo.com](https://www.brevo.com) com o e-mail da barbearia.
2. **Valide o domínio:** em *Senders, Domains & Dedicated IPs > Domains*, adicione `barbeariadofortao.com.br` e copie para o registro.br os registros que o Brevo mostrar (código do Brevo, **DKIM** e **DMARC**). Sem isso, os lembretes caem no spam ou nem saem.
3. **Remetente:** em *Senders*, cadastre o endereço que vai aparecer para o cliente, por exemplo `contato@barbeariadofortao.com.br`.
4. **Chave da API:** em *SMTP & API > API Keys*, clique em *Generate a new API key*, dê um nome (`site`) e copie a chave (começa com `xkeysib-`). Ela aparece uma vez só.
5. No `.env` do servidor:

   ```
   BREVO_API_KEY=xkeysib-a-chave-que-voce-copiou
   EMAIL_REMETENTE="Barbearia do Fortão <contato@barbeariadofortao.com.br>"
   ```

6. Aplique: `docker compose up -d app` (o `restart` não relê o `.env`).
7. **Confira:** o aviso amarelo de e-mail some do painel. Crie uma conta de teste no site: o e-mail de confirmação chega em segundos e aparece em *Transactional > Logs* no Brevo.

Se algo der errado, o painel mostra um aviso vermelho com a resposta do Brevo e o site tenta de novo sozinho (2, 4, 8, 16... minutos). Os motivos mais comuns:

| O painel mostra | O que fazer |
| --- | --- |
| `Brevo 401: Key not found` | Chave copiada errada ou apagada. Gere outra e troque no `.env`. |
| `Brevo 400` falando do remetente (*sender*) | O `EMAIL_REMETENTE` não está validado no Brevo (passos 2 e 3). |
| `Brevo 403` dizendo que a conta não está ativada | Conta nova: peça ao suporte do Brevo para ativar o envio transacional (SMTP). |
| `Brevo 402` | Acabou o limite do plano grátis no dia. |

Sem a chave, o site funciona normalmente: os e-mails ficam salvos em `var/emails/` e o painel avisa. Prefere SMTP? Preencha `SMTP_*` em vez de `BREVO_API_KEY` (no Brevo: *SMTP & API > SMTP*).

## 5. Biometria e WhatsApp

- **Biometria (passkeys):** não precisa configurar nada. Só funciona com HTTPS e fica presa ao domínio do `APP_URL`: se um dia o site mudar de domínio, cada cliente precisa ativar a biometria de novo (a senha continua valendo).
- **WhatsApp:** não há robô nem conta na Meta. O Fortão manda as mensagens do próprio WhatsApp, pelos botões **Mensagem** e **Salvar contato** do painel. Coloque o número da barbearia em Painel > Barbearia para o botão de WhatsApp do site.

## 6. Segurança do banco

- O MySQL do `docker-compose.yml` não abre porta para a internet: só o site, dentro do Docker, fala com ele.
- O site usa o usuário `fortao`, com acesso só ao banco `fortao`. A senha do `root` fica guardada para manutenção.
- Senhas, tokens de sessão e links de e-mail nunca ficam em texto puro no banco (argon2id e SHA-256).
- Nunca suba o `.env` para o GitHub.

## 7. Cópia de segurança

Rode todo dia, por exemplo com o `cron` do servidor:

```bash
docker compose exec -T banco sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction fortao' | gzip > backup-$(date +%F).sql.gz
```

Guarde as cópias fora do servidor (Google Drive, outro provedor).

## 8. Atualizar o site

```bash
git pull
docker compose up -d --build
```

As migrações novas do banco (arquivos em `servidor/db/migracoes/`) rodam sozinhas ao subir.

## Sem Docker

Também funciona em qualquer hospedagem com Node 22 e MySQL 8: `npm ci --omit=dev`, configure o `.env` e rode `npm start` atrás de um proxy com HTTPS (Nginx ou Caddy). Use `CONFIAR_PROXY=1` para os limites por IP enxergarem o IP real do cliente. Evite planos que "dormem" quando ninguém acessa: dormindo, os lembretes não saem.
