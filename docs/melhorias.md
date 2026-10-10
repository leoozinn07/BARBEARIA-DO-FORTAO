# Melhorias e alternativas

Tudo aqui é opcional. Escolha o que entra e em que ordem.

## Já dá para mudar hoje, pelo painel

| O quê | Padrão atual | Onde |
| --- | --- | --- |
| Preço, duração e nome dos serviços | 40, 45 e 60 min | Painel > Serviços |
| Dias e horário de funcionamento, pausa de almoço | Ter a sex 9h às 20h, sáb 8h às 18h | Painel > Horários |
| Antecedência mínima para marcar | 30 min | Painel > Barbearia |
| Quantos dias a agenda fica aberta | 30 dias | Painel > Barbearia |
| Intervalo entre horários | 15 min | Painel > Barbearia |
| Prazo para o cliente cancelar ou remarcar | 2 h antes | Painel > Barbearia |
| Máximo de horários futuros por cliente | 3 | Painel > Barbearia |
| Folgas e compromissos | nenhum | Painel > Folgas |

## Alternativas de visual

- **Cor de destaque:** hoje é só preto e cinza. Dá para usar verde ou amarelo só nos botões, como nas prévias da etapa 1.
- **Tema claro como padrão:** hoje o escuro é o padrão e o cliente escolhe o claro no perfil.
- **Hero da opção A ou B:** o topo da página inicial pode usar a foto em tela cheia da opção A ou o cartaz lambe-lambe da opção B, mantendo o resto da opção C.
- **Placa de rua da Cohab 5** (opção B) na seção "Onde fica".

## Ideias para crescer

| Ideia | O que faz | Esforço |
| --- | --- | --- |
| Corrida da Régua | Fidelidade: cada corte vale 1 km, 10 km dão um corte grátis. Combina com o Fortão corredor. | Médio |
| Lista de espera | Dia lotado? O cliente entra na fila e recebe aviso se alguém desmarcar. | Médio |
| Sinal por Pix | Um valor pequeno na reserva para reduzir faltas. Precisa de conta em um provedor Pix (Mercado Pago, Efí, Asaas). | Alto |
| Galeria de cortes | O Fortão sobe fotos dos cortes da semana pelo painel. | Médio |
| Avaliação depois do corte | E-mail pedindo nota e link para o Google Maps, que ajuda a aparecer nas buscas da região. | Baixo |
| Lembrete por WhatsApp | Além do e-mail e do push. Exige a API oficial do WhatsApp (cobrada por mensagem). | Médio |
| Vários barbeiros | O banco já aceita; falta a escolha do barbeiro na tela de marcar. | Médio |
| Estatísticas sem cookies | Visitas e conversão com Plausible ou Umami no próprio servidor, sem banner de cookies. | Baixo |

## Inteligência a partir dos dados

Com alguns meses de histórico, dá para usar aprendizado de máquina simples e explicável, sem mandar dados para fora:

- **Próximo corte sugerido:** o app aprende o intervalo de cada cliente (por exemplo, a cada 21 dias) e sugere a data no momento certo.
- **Risco de falta:** um modelo de regressão logística com faltas anteriores, antecedência da marcação, dia e horário indica quem merece um lembrete extra ou pedido de confirmação.
- **Horários de pico:** mostra ao Fortão quando abrir mais cedo ou fechar mais tarde.

Isso precisa de dados reais acumulados. O sistema já guarda o histórico no formato certo para isso.

## Antes do lançamento (pendências)

1. Endereço exato, WhatsApp, Instagram, razão social e CNPJ no painel.
2. Revisão jurídica dos termos, da política de privacidade e da página LGPD.
3. Fotos originais do Fortão em alta resolução e autorização de uso de imagem.
4. Licença do desenho do braço (a imagem original tem marca d'água de banco de imagens) ou um braço redesenhado.
5. Domínio, e-mail com SPF/DKIM e chaves de push configurados.
