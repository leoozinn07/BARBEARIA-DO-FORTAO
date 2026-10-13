# Melhorias e alternativas

Tudo aqui é opcional. Escolha o que entra e em que ordem.

## Já dá para mudar hoje, pelo painel

| O quê | Padrão atual | Onde |
| --- | --- | --- |
| Serviços: nome, preço, duração, descrição, criar, esconder e remover | 3 serviços (R$ 40, 45 e 50) | Painel > Serviços |
| Dias e horário de funcionamento, pausa de almoço | Ter a sex 9h às 20h, sáb 8h às 18h | Painel > Horários |
| Antecedência mínima para marcar | 30 min | Painel > Barbearia |
| Quantos dias a agenda fica aberta | 30 dias | Painel > Barbearia |
| Intervalo entre horários | 15 min | Painel > Barbearia |
| Prazo para o cliente cancelar ou remarcar | 2 h antes | Painel > Barbearia |
| Máximo de horários futuros por cliente | 3 | Painel > Barbearia |
| Folgas e compromissos | nenhum | Painel > Folgas |
| Período do rendimento | este mês | Painel > Rendimento |

## Alternativas de visual

- **Fotos de verdade no lugar das ilustrações:** hoje o site usa ilustrações próprias (navalha, tesoura, pente, máquina, pincel). Dá para trocar por fotos geradas por IA no Figma (gasta créditos do seu plano) ou por fotos da barbearia, sem o Fortão: cadeira, bancada, fachada.
- **Mais ou menos dourado:** hoje ele aparece no preço da tabela, no contador de avisos, na escolha marcada, no gráfico e no contorno de toque. Dá para tirar do preço ou levar para o botão principal.
- **Tema claro como padrão:** hoje o escuro é o padrão e o cliente escolhe o claro no perfil.

## Ideias para crescer

| Ideia | O que faz | Esforço |
| --- | --- | --- |
| Corrida da Régua | Fidelidade: cada corte vale 1 km, 10 km dão um corte grátis. Combina com o Fortão corredor. | Médio |
| Lista de espera | Dia lotado? O cliente entra na fila e recebe aviso se alguém desmarcar. | Médio |
| Meta do mês | O Fortão define uma meta no painel e o rendimento mostra quanto falta. | Baixo |
| Rendimento por horário | Mostra os horários e dias da semana que mais rendem, para abrir mais cedo ou fechar mais tarde. | Baixo |
| Exportar o rendimento | Baixar a tabela do período em planilha (CSV) para o contador. | Baixo |
| Galeria de cortes | O Fortão sobe fotos dos cortes da semana pelo painel. | Médio |
| Avaliação depois do corte | E-mail pedindo nota e link para o Google Maps, que ajuda a aparecer nas buscas da região. | Baixo |
| Lembrete por WhatsApp | Além do e-mail. Exige a API oficial do WhatsApp (cobrada por mensagem). | Médio |
| Vários barbeiros | O banco já aceita; falta a escolha do barbeiro na tela de marcar e o rendimento por barbeiro. | Médio |
| Estatísticas sem cookies | Visitas e conversão com Plausible ou Umami, sem banner de cookies. | Baixo |

## Inteligência a partir dos dados

Com alguns meses de histórico, dá para usar aprendizado de máquina simples e explicável, sem mandar dados para fora:

- **Próximo corte sugerido:** o site aprende o intervalo de cada cliente (por exemplo, a cada 21 dias) e sugere a data no momento certo.
- **Risco de falta:** um modelo de regressão logística com faltas anteriores, antecedência da marcação, dia e horário indica quem merece um lembrete extra.
- **Previsão do mês:** com o que já entrou e o que está marcado, o rendimento estima o fechamento do mês.

Isso precisa de dados reais acumulados. O banco já guarda o histórico no formato certo.

## Antes do lançamento (pendências)

1. Endereço exato, WhatsApp, Instagram, razão social e CNPJ no painel.
2. Domínio e e-mail com SPF/DKIM configurados.
3. Revisão jurídica dos termos, da política de privacidade e da página LGPD.
4. Licença do desenho do braço da logo (a imagem original tem marca d'água de banco de imagens) ou um braço redesenhado.
