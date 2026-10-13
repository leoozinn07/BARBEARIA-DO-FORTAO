# Lembretes e robô no WhatsApp

O site manda pelo WhatsApp a confirmação de cada horário, o lembrete 1 dia antes e 2 horas antes, e avisa quando o horário muda ou é cancelado. O cliente responde e um robô atende:

| O cliente responde | O que acontece |
| --- | --- |
| `1`, "sim", "confirmo" | Presença confirmada. No painel aparece o selo dourado "Confirmou". |
| `2`, "cancelar" | Cancela o horário, se faltar mais de 2 horas (o prazo da aba Barbearia). Com menos tempo, o robô explica que precisa falar com a barbearia. |
| Qualquer outra coisa | O robô mostra o próximo horário e as opções. |

Isso usa a **API oficial do WhatsApp (WhatsApp Cloud API, da Meta)**. Não é preciso deixar celular ligado nem usar aplicativo pirata, que pode ter o número banido.

Enquanto nada disso estiver configurado, o site funciona normalmente: as mensagens ficam guardadas em `var/whatsapp/` e o painel mostra o aviso "O WhatsApp ainda não está ligado".

## 1. O que você precisa

- Uma conta no **Meta Business** (business.facebook.com) em nome da barbearia.
- Um número de telefone só para o WhatsApp da barbearia, que **não** esteja em uso no aplicativo WhatsApp comum (pode ser um chip novo).
- Custo: a Meta cobra por conversa iniciada pela empresa (categoria "utilidade", alguns centavos cada no Brasil). As respostas do robô dentro de 24 h da mensagem do cliente não pagam a mais.

## 2. Criar o app e o número

1. Em developers.facebook.com, crie um app do tipo **Business** e adicione o produto **WhatsApp**.
2. Em **WhatsApp > API Setup**, cadastre e verifique o número da barbearia.
3. Anote o **Phone number ID** (vai em `WHATSAPP_NUMERO_ID`).
4. Crie um **usuário do sistema** no Business Manager com acesso ao app e gere um **token permanente** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` (vai em `WHATSAPP_TOKEN`).
5. Em **App settings > Basic**, copie o **App secret** (vai em `WHATSAPP_SEGREDO_APP`).

## 3. Modelos de mensagem

Mensagem que a barbearia manda primeiro precisa de um modelo aprovado pela Meta. Em **WhatsApp Manager > Modelos de mensagem**, crie os quatro abaixo, categoria **Utilidade**, idioma **Português (BR)**, com o nome e as variáveis exatamente nesta ordem. Se quiser outros nomes, mude no `.env`.

**`horario_confirmado`** (4 variáveis: nome, serviço, quando, valor)
> Fala, {{1}}! Seu horário na Barbearia do Fortão está confirmado: {{2}}, {{3}}. Valor: {{4}}, pago na barbearia. Responda 1 para confirmar presença ou 2 para cancelar.

**`lembrete_horario`** (3 variáveis: nome, serviço, quando)
> {{1}}, passando para lembrar do seu horário na Barbearia do Fortão: {{2}}, {{3}}. Responda 1 para confirmar presença ou 2 para cancelar.

**`horario_remarcado`** (3 variáveis: nome, serviço, quando)
> {{1}}, seu horário na Barbearia do Fortão mudou: {{2}}, {{3}}. Responda 1 para confirmar presença ou 2 para cancelar.

**`horario_cancelado`** (3 variáveis: nome, serviço, quando)
> {{1}}, seu horário na Barbearia do Fortão ({{2}}, {{3}}) foi cancelado. Quando quiser, é só marcar de novo pelo site.

Exemplo para a Meta aprovar: `Lucas`, `Corte navalhado + Luzes`, `quinta-feira, 15 de outubro às 10:00`, `R$ 105,00`.

A aprovação costuma sair em minutos ou poucas horas.

## 4. Webhook (para o robô receber as respostas)

1. Invente um código qualquer, longo, e coloque em `WHATSAPP_TOKEN_VERIFICACAO`.
2. Reinicie o site com as variáveis novas.
3. Em **WhatsApp > Configuration > Webhook**, preencha:
   - **Callback URL:** `https://seu-dominio/api/whatsapp/webhook`
   - **Verify token:** o mesmo código do passo 1
4. Clique em **Verify and save** e assine o campo **messages**.

O site só aceita avisos assinados com o App secret, então ninguém consegue cancelar horário de outra pessoa fingindo ser a Meta.

## 5. Variáveis no `.env`

```
WHATSAPP_TOKEN=token-permanente-do-usuario-do-sistema
WHATSAPP_NUMERO_ID=123456789012345
WHATSAPP_SEGREDO_APP=app-secret-do-app
WHATSAPP_TOKEN_VERIFICACAO=um-codigo-longo-que-voce-inventou
```

Opcionais: `WHATSAPP_VERSAO_API` (padrão `v21.0`), `WHATSAPP_IDIOMA` (padrão `pt_BR`) e os nomes dos modelos (`WHATSAPP_MODELO_CONFIRMACAO`, `WHATSAPP_MODELO_LEMBRETE`, `WHATSAPP_MODELO_REMARCADO`, `WHATSAPP_MODELO_CANCELADO`).

## 6. Conferir

1. Marque um horário pelo site com o seu número.
2. A confirmação chega no WhatsApp em segundos.
3. Responda `1`: o horário ganha o selo "Confirmou" no painel.
4. Se algo falhar, a mensagem fica na fila e o site tenta de novo (2, 4, 8, 16… minutos). O motivo aparece no log como `whatsapp_falhou`.

## Privacidade

O cliente informa o número no mini formulário antes de confirmar o horário, e a caixa "Quero receber a confirmação e os lembretes neste WhatsApp" registra o aceite com data (LGPD). Quem desmarcar a caixa recebe só o e-mail e os avisos no site.
