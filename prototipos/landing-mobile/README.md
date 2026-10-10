# Protótipos: landing page mobile

Etapa 1 do projeto Barbearia do Fortão. Três opções de página inicial para escolher antes de construir o app completo.

## Como ver

- **No celular, sem instalar nada:** abra os arquivos de `previas/arquivo-unico/`. Cada um é uma página completa em um arquivo só (fontes, ícones e fotos embutidos).
- **Imagens prontas:** `previas/comparativo.jpg` mostra as três primeiras telas lado a lado. Os arquivos `*-completa.jpg` mostram cada página inteira.
- **Com servidor local** (para usar a página de escolha com prévias ao vivo):

```bash
npx serve prototipos/landing-mobile
# abra http://localhost:3000
```

A página `index.html` tem os ajustes de cor de destaque (`?destaque=verde` ou `?destaque=amarelo`) e de tema da opção C (`?tema=claro`).

## As opções

| Arquivo | Conceito |
| --- | --- |
| `opcao-a-ritmo.html` | Rotina de treino: números de peito de corrida, cadência "Corre. Treina. Corta na régua." |
| `opcao-b-lambe.html` | Lambe-lambe de São Paulo: cartazes xerox, fita crepe, placa de rua da Cohab 5 |
| `opcao-c-cadeira.html` | App primeiro: agendamento em 3 toques na própria página e barra de abas |

## Estrutura

```
assets/
  css/base.css        fontes locais, reset, tokens de movimento, acessibilidade
  css/opcao-*.css     estilo de cada opção
  js/comum.js         menu, revelar ao rolar, barra fixa, sliders, mapa sob demanda
  js/opcao-c.js       simulação do agendamento da opção C
  fonts/              Archivo, Big Shoulders Display, Geist, Geist Mono (woff2, servidas localmente)
  icons/              Phosphor Icons (woff2)
  logo/               braço em vetor (P&B), ícone do app, favicon
  img/                fotos do Fortão tratadas em preto e branco
previas/              imagens e versões de arquivo único
```

## O que ainda é exemplo

- Endereço, horários de funcionamento e duração dos serviços.
- Horários livres e "próximo horário livre" da opção C (gerados no navegador).
- Links de WhatsApp, Instagram, Termos, Privacidade e LGPD (as páginas entram na etapa do app).

## Logo

O braço foi vetorizado a partir da imagem enviada (`assets/logo/braco.svg`). A imagem original tem marca d'água de banco de imagens: antes de publicar, é preciso comprar a licença de uso como marca ou redesenhar um braço próprio.
