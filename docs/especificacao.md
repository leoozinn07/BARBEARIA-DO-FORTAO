# Especificação: site da Barbearia do Fortão

Versão de 13/10/2026. Antes era site + app Android; agora é só o site, hospedado, com Node e MySQL.
Base visual: opção C ("Cadeira") com a logo da opção A, preto e cinza, dourado só em detalhes.

## 1. Objetivo

Site para clientes da Barbearia do Fortão (Cohab 5, São Paulo) marcarem corte e serviços de cabelo sem fila, com confirmação e lembrete por e-mail e avisos na própria conta. O pagamento é feito na barbearia. O Fortão usa o painel para tocar a agenda, mudar preços e serviços e ver o rendimento.

Sucesso é: cliente marca em poucos toques, não esquece o horário, o Fortão nunca recebe dois clientes no mesmo horário e sabe quanto entrou no mês.

## 2. Pedidos e suposições

| Pedido | Como ficou (editável no painel ou no `.env`) |
| --- | --- |
| Site hospedado, não mais app | PWA, service worker, notificação push e pacote da Play Store saíram. Avisos ficam no sino do site e no e-mail |
| Sem fotos do Fortão | Ilustrações próprias de ferramentas de barbeiro (navalha, tesoura, pente, máquina, pincel), em SVG |
| Sem sistema de pagamento | Preço aparece antes de confirmar; pagamento na barbearia |
| Fortão altera preços e serviços | Painel > Serviços: criar, editar nome, preço, duração e descrição, esconder ou remover |
| Banco de dados | MySQL 8, como antes. No Docker, o banco não abre porta para a internet |
| Dourado em detalhes e no toque | Preço da tabela, contador de avisos, escolha marcada, gráfico; contorno dourado ao tocar em botão ou caixa |
| Rendimento | Painel > Rendimento: recebido, a receber, atendimentos, ticket médio, faltas, gráfico por dia ou mês e por serviço |
| Tudo funcional, sem "testes" | Sem dados de exemplo e sem suíte de testes no repositório. O fluxo foi conferido à mão num MySQL local |
| Catálogo inicial | Corte Fortão R$ 40 (40 min), Corte e sobrancelha R$ 45 (45 min), Corte e barba R$ 50 (60 min) |
| Não informado | Terça a sexta 9h às 20h, sábado 8h às 18h; antecedência de 30 min; agenda aberta 30 dias; cancelar até 2 h antes |

## 3. Arquitetura

```
Navegador (HTML + CSS + JS em módulos, sem framework)
   ▼
Node 22 + Express 5 ──► MySQL 8
   │                            ├─ dados (usuários, agenda, avisos…)
   │                            └─ fila de e-mails (outbox)
   ├─ a cada minuto: lembretes 24 h e 2 h
   ├─ a cada 15 s: entrega de e-mails por SMTP, com novas tentativas
   ├─ a cada 10 min: horário confirmado que terminou há 3 h vira "concluído"
   └─ a cada 6 h: limpeza de sessões, tokens e avisos vencidos
```

- Páginas em `publico/`, servidas pelo Express com URLs limpas (`/entrar`, `/conta`, `/admin`). API JSON em `/api/*`.
- Só o servidor fala com o banco (driver `mysql2`, consultas sempre com parâmetros). O navegador nunca acessa o banco.
- Lembretes e e-mails usam reserva atômica no banco: mais de uma instância não duplica envio.

## 4. Banco de dados (MySQL 8)

| Tabela | Para quê |
| --- | --- |
| `usuarios` | Clientes e admin, hash de senha (argon2id), papel, verificação de e-mail, bloqueio por tentativas |
| `sessoes` | Sessões: só o hash SHA-256 do token |
| `tokens_uso_unico` | Verificar e-mail e redefinir senha (hash, validade, uso único) |
| `consentimentos` | Aceite de termos, privacidade e marketing, com versão e data |
| `barbeiros` | Quem atende (hoje só o Fortão) |
| `servicos` | Nome, preço em centavos, duração, ativo, ordem |
| `horarios_funcionamento` | Faixas por dia da semana (permite pausa de almoço) |
| `bloqueios` | Períodos fechados pelo Fortão |
| `agendamentos` | Horário em UTC, cópia do nome e do preço do serviço, status, origem (site ou balcão), marcações de lembrete |
| `agenda_travas` | Uma linha por barbeiro e dia, travada com `SELECT … FOR UPDATE` ao marcar |
| `notificacoes` | Avisos do sino |
| `emails_saida` | Fila de e-mails |
| `configuracoes` | Endereço, contatos, regras da agenda (JSON) |
| `auditoria` | Ações do admin e eventos de segurança |
| `migracoes` | Quais arquivos de `servidor/db/migracoes/` já rodaram |

A migração `002_site.sql` tira a tabela de inscrições de notificação push e troca a origem "app" por "site". Ela roda sozinha em bancos que já tinham a versão anterior.

**Sem horário duplicado:** ao marcar ou remarcar, a transação trava a linha do dia em `agenda_travas`, confere sobreposição com horários e folgas e só então grava. Dois pedidos simultâneos para o mesmo horário: um entra, o outro recebe "esse horário acabou de ser ocupado".

**Preço congelado:** o agendamento guarda o preço do momento da marcação. Mudar a tabela não muda horários já marcados nem o rendimento de meses anteriores.

**Fuso:** horários em UTC; funcionamento e relatórios no horário de São Paulo (`America/Sao_Paulo`).

## 5. Rendimento

- **Recebido:** soma dos horários concluídos no período (pago na barbearia).
- **A receber:** horários confirmados no período.
- **Faltas:** quantidade e valor que não entrou. **Cancelados** não contam.
- **Ticket médio:** recebido ÷ atendimentos concluídos.
- **Comparação:** com o período anterior equivalente (mês com mês, nos mesmos dias já passados).
- As somas por dia são feitas no servidor, no horário de São Paulo, sem depender das tabelas de fuso do MySQL.
- Horário confirmado vira concluído sozinho 3 h depois do fim. Se o cliente não veio, o Fortão marca "Faltou" (dá para desfazer).
- Gráfico de colunas empilhadas por dia (até 62 dias) ou por mês, lista por serviço e tabela com os mesmos números.

## 6. Segurança

- Senha argon2id (parâmetros OWASP), mínimo 8 caracteres, senhas comuns recusadas.
- Sessão em cookie `HttpOnly`, `SameSite=Lax`, `Secure` e prefixo `__Host-` em produção; token novo no login; todas as sessões encerradas ao trocar ou redefinir senha.
- CSRF: cookie + cabeçalho iguais e conferência de `Origin`.
- Limites por IP em login, cadastro, senha e agendamento; conta trava 15 min depois de 8 senhas erradas.
- Helmet com CSP sem script inline, HSTS em produção.
- Entrada validada com Zod; SQL só com parâmetros; front sem `innerHTML` com dado do usuário.
- No Docker, o MySQL fica numa rede interna, sem porta aberta para a internet; o site usa um usuário com acesso só ao banco `fortao`.

## 7. LGPD

- Coleta mínima: nome, e-mail, telefone opcional. Aceite registrado com versão; marketing opcional e separado.
- Só cookies essenciais; fontes e ícones servidos pelo próprio site; mapa do Google só depois do toque.
- Na conta: baixar os dados (JSON) e excluir a conta (anonimiza, cancela horários futuros, mantém o histórico sem dados pessoais).

## 8. E-mails e avisos

| Evento | E-mail | Aviso no sino |
| --- | --- | --- |
| Cadastro | Confirme seu e-mail | Boas-vindas |
| Esqueci a senha | Link de redefinição (1 h) | Não |
| Agendamento | Confirmação com valor, endereço e convite de agenda (.ics) | Sim |
| Remarcação | Novo horário | Sim |
| Cancelamento | Pelo cliente ou pelo Fortão, com motivo | Sim |
| Lembrete 24 h e 2 h | Sim | Sim |
| Novo horário, remarcação e cancelamento (para o Fortão) | Sim | Sim |

Sem SMTP configurado, os e-mails ficam em `var/emails/` e o painel mostra um aviso.

## 9. Telas

Cliente: início (agendamento em 3 toques), entrar, criar conta, esqueci a senha, redefinir senha, confirmar e-mail, marcar horário, minha conta (horários, perfil, aparência, senha, privacidade), termos, privacidade, LGPD e 404.

Fortão: agenda do dia, resumo, rendimento, novo horário (cliente com conta ou do balcão), concluir, falta, remarcar, cancelar com motivo, folgas, serviços e preços, horário de funcionamento, dados da barbearia, clientes.

## 10. Fora desta versão

Pagamento online, fidelidade, lista de espera, galeria de cortes, vários barbeiros na tela de marcar. O banco já deixa espaço para eles.
