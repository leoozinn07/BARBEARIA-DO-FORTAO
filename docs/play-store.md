# Publicar na Play Store

O app Android é o próprio site rodando em tela cheia, sem barra de endereço, com ícone e notificações (Trusted Web Activity). Um código só para o site e o app: toda atualização no servidor já chega no app, sem enviar versão nova para a loja.

## 1. Antes de começar

- O site precisa estar no ar com HTTPS ([deploy.md](deploy.md)).
- Conta de desenvolvedor no Google Play Console: taxa única de US$ 25. Pode ser em nome do Fortão (pessoa física) ou da empresa (exige CNPJ e D-U-N-S).
- Computador com Node 22 e Java 17.

## 2. Gerar o app com o Bubblewrap

```bash
npm install -g @bubblewrap/cli
mkdir android && cd android
bubblewrap init --manifest https://seu-dominio/manifest.webmanifest
```

Responda usando os valores de [`play-store/twa-manifest.exemplo.json`](play-store/twa-manifest.exemplo.json): pacote `br.com.barbeariadofortao.app`, nome "Barbearia do Fortão", cor `#0b0b0c`, notificações ativadas. O Bubblewrap cria a chave de assinatura: **guarde o arquivo `.keystore` e a senha em lugar seguro**, sem eles não dá para atualizar o app.

```bash
bubblewrap build
```

Saem dois arquivos: `app-release-bundle.aab` (vai para a loja) e `app-release-signed.apk` (para testar no celular).

## 3. Ligar o app ao site (sem barra de endereço)

```bash
keytool -list -v -keystore android.keystore | grep SHA256
```

Coloque a impressão no `.env` do servidor e reinicie:

```
TWA_PACOTE=br.com.barbeariadofortao.app
TWA_SHA256=AA:BB:CC:...
```

Confira em `https://seu-dominio/.well-known/assetlinks.json`. Quando publicar, o Google Play reassina o app: copie também a impressão SHA-256 de **Configuração > Integridade do app** do Play Console e coloque as duas no `TWA_SHA256`, separadas por vírgula.

## 4. Ficha da loja

| Campo | O que usar |
| --- | --- |
| Ícone 512x512 | `publico/img/icone-512.png` |
| Imagem de destaque 1024x500 | `docs/play-store/destaque-1024x500.png` |
| Capturas de tela | `docs/play-store/capturas/` (1080x2160) |
| Descrição curta | Marque seu corte na Cohab 5 em 3 toques. Sem fila, com lembrete. |
| Categoria | Estilo de vida |
| Política de privacidade | `https://seu-dominio/privacidade` |
| Exclusão de conta (obrigatório) | `https://seu-dominio/lgpd` (no app: Minha conta > Privacidade) |

Descrição completa sugerida:

> Na Barbearia do Fortão, na Cohab 5, o seu horário é respeitado. Escolha o serviço, o dia e o horário em poucos toques e receba a confirmação na hora. A gente lembra você um dia antes e duas horas antes, por e-mail e notificação. Mudou o plano? Remarque ou cancele pelo app.
>
> Corte Fortão, corte e sobrancelha, corte e barba: preço fechado, pago na barbearia.
>
> Constância vence talento.

## 5. Segurança dos dados (formulário do Google)

| Pergunta | Resposta |
| --- | --- |
| Coleta dados? | Sim: nome, e-mail, telefone (opcional), histórico de agendamentos |
| Compartilha com terceiros? | Não (provedores de hospedagem e e-mail não contam como compartilhamento) |
| Criptografia em trânsito | Sim (HTTPS) |
| O usuário pode pedir exclusão? | Sim, no app e pelo site |
| Finalidade | Funcionalidade do app e gerenciamento da conta |

## 6. Publicar

1. Crie o app no Play Console e preencha a ficha.
2. Envie o `.aab` primeiro para **Teste interno** e instale pelo link em 2 ou 3 celulares.
3. Contas pessoais novas precisam de um **teste fechado** com pelo menos 12 testadores por 14 dias antes da produção (regra do Google desde 2023).
4. Promova para **Produção**. A análise costuma levar de 1 a 7 dias.
