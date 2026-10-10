# Especificação: app Barbearia do Fortão

Data: 10/10/2026. Base visual aprovada: opção C ("Cadeira") com a logo da opção A.

## 1. Objetivo

Site e app Android para clientes da Barbearia do Fortão (Cohab 5, São Paulo) marcarem horário sem fila, receberem confirmação e lembrete por e-mail e aviso no app. O Fortão usa um painel para ver e tocar a agenda.

Sucesso é: cliente marca em poucos toques, não esquece o horário, e o Fortão nunca recebe dois clientes no mesmo horário.

## 2. O que o usuário pediu e o que é suposição

| Pedido pelo usuário | Suposição minha (editável no painel ou no `.env`) |
| --- | --- |
| Contas com e-mail e senha | Login funciona logo após o cadastro; o e-mail de verificação chega na hora e a conta mostra um aviso até confirmar |
| Painel do admin "Fortão" | O admin é criado por comando (`npm run admin:criar`) com o e-mail que o Fortão escolher |
| Catálogo: Corte Fortão R$ 40, Corte e sobrancelha R$ 45, Corte e barba R$ 50 | Durações de 40, 45 e 60 minutos |
| Localização na Cohab 5 | Endereço, WhatsApp e Instagram ficam em configuração; até preencher, aparecem como "a confirmar" |
| E-mails de agendamento e lembrete | Lembretes 24 h e 2 h antes; envio por SMTP de qualquer provedor (Brevo, Resend, Gmail Workspace, Hostinger) |
| Notificações no app | Central de avisos no app e notificação push (Web Push) quando o cliente permitir |
| Termos, privacidade e LGPD | Textos-modelo prontos; precisam de revisão jurídica e dos dados da empresa (razão social, CNPJ) |
| Site e app na Play Store | PWA empacotado como app Android com Trusted Web Activity (Bubblewrap) |
| HTML, CSS, JS, Node e MySQL | Express 5, MySQL 8, sem framework de front-end |
| Não informado | Funcionamento de terça a sexta 9h às 20h, sábado 8h às 18h, domingo e segunda fechado |
| Não informado | Um barbeiro (Fortão). O banco já aceita mais barbeiros |
| Não informado | Antecedência mínima de 30 min para marcar e agenda aberta para os próximos 30 dias |
| Não informado | Cliente cancela ou remarca pelo app até 2 h antes |
| Não informado | Pagamento no local. Pix antecipado fica para depois |

## 3. Arquitetura

```
Navegador / app Android (TWA)
   │  HTML + CSS + JS (módulos), service worker
   ▼
Node 22 + Express 5 ──► MySQL 8
   │                     ├─ dados (usuários, agenda, avisos…)
   │                     └─ fila de e-mails (outbox)
   ├─ agendador interno (a cada minuto): lembretes 24 h e 2 h
   ├─ entregador de e-mails (a cada 15 s): SMTP com novas tentativas
   └─ Web Push (VAPID)
```

- Páginas estáticas em `publico/`, servidas pelo Express com URLs limpas (`/entrar`, `/conta`, `/admin`).
- API JSON em `/api/*`.
- Um processo só. Lembretes e e-mails usam "reserva" atômica no banco, então rodar mais de uma instância não duplica envio.

## 4. Modelo de dados (MySQL)

| Tabela | Para quê |
| --- | --- |
| `usuarios` | Clientes e admin, com hash de senha (argon2id), papel, verificação de e-mail e bloqueio por tentativas |
| `sessoes` | Sessões: só o hash SHA-256 do token fica no banco |
| `tokens_uso_unico` | Verificar e-mail e redefinir senha (hash, validade, uso único) |
| `consentimentos` | Registro LGPD de aceite de termos, privacidade e marketing, com versão e data |
| `barbeiros` | Quem atende (hoje só o Fortão) |
| `servicos` | Nome, preço em centavos, duração, ativo, ordem |
| `horarios_funcionamento` | Faixas por dia da semana (permite pausa de almoço) |
| `bloqueios` | Períodos fechados pelo Fortão (folga, compromisso) |
| `agendamentos` | Horário em UTC, cópia do nome e preço do serviço, status, marcações de lembrete |
| `agenda_travas` | Uma linha por barbeiro e dia, travada com `SELECT … FOR UPDATE` ao marcar |
| `notificacoes` | Central de avisos do app |
| `push_inscricoes` | Inscrições Web Push por aparelho |
| `emails_saida` | Fila de e-mails com tentativas e próxima tentativa |
| `configuracoes` | Endereço, contatos, regras de agenda |
| `auditoria` | Ações do admin e eventos de segurança |

**Sem horário duplicado:** ao marcar ou remarcar, a transação trava a linha do dia em `agenda_travas`, confere sobreposição com agendamentos e bloqueios e só então grava. Dois pedidos simultâneos para o mesmo horário: um entra, o outro recebe "esse horário acabou de ser ocupado".

**Fuso:** horários gravados em UTC; regras de funcionamento em horário de São Paulo, convertidas com `Intl` (`America/Sao_Paulo`).

## 5. Segurança

- Senha: argon2id (parâmetros OWASP), mínimo 8 caracteres, lista de senhas comuns recusada.
- Sessão: token aleatório de 256 bits em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção (prefixo `__Host-`). Troca de token no login, todas as sessões encerradas ao trocar ou redefinir senha.
- CSRF: cookie + cabeçalho `X-CSRF-Token` iguais (double submit) e conferência de `Origin` em todo pedido que altera dados.
- Limites: login, cadastro, esqueci a senha e agendamento com limite por IP; conta trava 15 min depois de 8 senhas erradas.
- Cabeçalhos: Helmet com CSP restrita (sem script inline), HSTS em produção, `Referrer-Policy`, `Permissions-Policy`.
- Entrada validada com Zod; SQL só com parâmetros; front sem `innerHTML` com dado do usuário.
- Admin: rotas exigem papel `admin` e ficam registradas na auditoria.
- Mensagens genéricas em "esqueci a senha" (não revela se o e-mail existe).

## 6. LGPD

- Coleta mínima: nome, e-mail, telefone opcional.
- Aceite de termos e privacidade obrigatório no cadastro, marketing opcional e separado, tudo registrado com versão.
- Só cookies essenciais (sessão e CSRF), então não há banner de cookies; isso está explicado na política.
- Fontes e ícones servidos pelo próprio site; o mapa do Google só carrega depois do toque.
- Na conta: baixar meus dados (JSON) e excluir conta. A exclusão anonimiza o cadastro, cancela horários futuros e mantém o histórico de atendimentos sem dados pessoais.
- Página LGPD com os direitos do titular e o contato do encarregado.

## 7. E-mails e avisos

| Evento | E-mail | Aviso no app | Push |
| --- | --- | --- | --- |
| Cadastro | Confirme seu e-mail | Boas-vindas | Não |
| Esqueci a senha | Link de redefinição (1 h) | Não | Não |
| Agendamento | Confirmação com data, hora, valor, endereço e link de agenda (.ics) | Sim | Não |
| Remarcação | Novo horário | Sim | Não |
| Cancelamento | Pelo cliente ou pelo Fortão, com motivo | Sim | Sim |
| Lembrete 24 h e 2 h | Sim | Sim | Sim |
| Novo agendamento (para o Fortão) | Sim | Sim | Sim |

Sem SMTP configurado (desenvolvimento), os e-mails são salvos em `var/emails/` para conferência.

## 8. Telas

Cliente: início (landing com agendamento em 3 toques), entrar, criar conta, esqueci a senha, redefinir senha, confirmar e-mail, marcar horário, minha conta (agendamentos, avisos, perfil, privacidade), termos, privacidade, LGPD, offline e 404.

Fortão: painel com a agenda do dia e da semana, resumo, concluir, marcar falta, cancelar com motivo, marcar cliente avulso (WhatsApp ou balcão), bloquear horários, editar serviços, horários de funcionamento e dados da barbearia, busca de clientes.

Visual: tokens e componentes da opção C, tema escuro padrão, tema claro e modo letra grande no perfil.

## 9. Play Store

PWA com manifest, ícones 192/512 e maskable, service worker com página offline e push. Empacotamento com Bubblewrap (Trusted Web Activity); o arquivo `/.well-known/assetlinks.json` é gerado a partir da impressão digital da chave de assinatura no `.env`.

## 10. Testes

- API com `node:test` + Supertest contra um MySQL de teste: cadastro, login, CSRF, limites, horários livres, conflito simultâneo, cancelamento, permissões do admin, lembretes sem duplicar, fila de e-mail, exportar e excluir dados.
- Fluxo completo no navegador com Playwright: cadastro, agendamento, conta e painel.

## 11. Fora desta versão

Pagamento online, programa de fidelidade, lista de espera, galeria de cortes, vários barbeiros na interface e previsões com dados de histórico. O modelo de dados já deixa espaço para eles.
