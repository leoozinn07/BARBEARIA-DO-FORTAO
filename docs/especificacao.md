# Especificação: site da Barbearia do Fortão

Versão de 13/10/2026 (revisão: sem robô do WhatsApp, com biometria). Antes era site + app Android; agora é só o site, hospedado, com Node e MySQL.
Base visual: opção C ("Cadeira") com a logo da opção A, preto e cinza, dourado só em detalhes.

## 1. Objetivo

Site para clientes da Barbearia do Fortão (Cohab 5, São Paulo) marcarem corte e serviços de cabelo sem fila, com confirmação e lembrete por e-mail e avisos na própria conta. O pagamento é feito na barbearia. O Fortão usa o painel para tocar a agenda, mudar preços e serviços e ver o rendimento.

Sucesso é: cliente marca em poucos toques, não esquece o horário, o Fortão nunca recebe dois clientes no mesmo horário e sabe quanto entrou no mês.

## 2. Pedidos e suposições

| Pedido | Como ficou (editável no painel ou no `.env`) |
| --- | --- |
| Site hospedado, não mais app | PWA, service worker, notificação push e pacote da Play Store saíram. Avisos ficam no sino do site e no e-mail |
| Imagens (13/10) | Banner enviado pela barbearia no topo da página inicial (inteiro, sem cortar o letreiro; o emblema "V" foi apagado e o fundo redesenhado) e ilustração do corte como capa de /agendar. WebP em 3 tamanhos e JPG de reserva. O banner também é a imagem de compartilhamento (1200×630). Ilustrações em SVG continuam na tela de entrar e na seção do Fortão |
| Animação de boas-vindas | Cadastro: "Bem-vindo ao seu lar, nome". Login (senha ou biometria): "Fortaleça sua autoestima novamente, nome". Só para clientes, na página seguinte, 3,6 s, pula com um toque ou Esc, sem movimento para quem pede movimento reduzido |
| Sem sistema de pagamento | Preço aparece antes de confirmar; pagamento na barbearia |
| Fortão altera preços e serviços | Painel > Serviços: criar, editar nome, preço, duração e descrição, esconder ou remover |
| Banco de dados | MySQL 8, como antes. No Docker, o banco não abre porta para a internet |
| Dourado em detalhes e no toque | Preço da tabela, contador de avisos, escolha marcada, gráfico; contorno dourado ao tocar em botão ou caixa |
| Rendimento | Painel > Rendimento: recebido, a receber, atendimentos, ticket médio, faltas, gráfico por dia ou mês e por serviço |
| Tudo funcional, sem "testes" | Sem dados de exemplo e sem suíte de testes no repositório. O fluxo foi conferido à mão num MySQL local |
| Catálogo (13/10) | Corte navalhado, Corte normal, Corte + sobrancelha, Corte + sobrancelha + barba, Corte + barba; adicionais Luzes, Boyzão e Progressiva. Preços e tempos iniciais são suposição, editáveis no painel |
| Confirmação antes de marcar | Folha "Tem certeza e consciência de que esse será o horário agendado?" com Sim / Não |
| Sem robô do WhatsApp (13/10) | O cliente informa o celular no mini formulário da confirmação (obrigatório). O Fortão fala com ele pelo próprio WhatsApp: no painel, botão Mensagem (texto pronto em link wa.me) e Salvar contato (.vcf) |
| Lembretes por e-mail, de graça | Confirmação, 1 dia antes, 2 horas antes, remarcação e cancelamento pela API do Brevo (`BREVO_API_KEY`, grátis até 300 por dia; SMTP como alternativa) e no sino do site |
| Termos e privacidade no site | Rodapé de todas as páginas, cadastro, tela de entrar e folha de confirmação; textos revistos para e-mail, WhatsApp manual e biometria |
| Entrar com biometria | Passkeys (WebAuthn): o cliente com conta ativa no perfil e entra com digital, rosto ou PIN |
| Lembrete logo depois de marcar | Agenda do celular (.ics) e Google Agenda na folha de sucesso e no cartão do horário |
| Botão claro/escuro | No topo de todas as páginas; fica guardado no aparelho e na conta |
| Fechado domingo e segunda; cancelar até 2 h antes | Horário de funcionamento e prazo iniciais, editáveis no painel |
| Não informado | Terça a sexta 9h às 20h, sábado 8h às 18h; antecedência de 30 min; agenda aberta 30 dias; cancelar até 2 h antes |

## 3. Arquitetura

```
Navegador (HTML + CSS + JS em módulos, sem framework)
   ▼
Node 22 + Express 5 ──► MySQL 8
   │                            ├─ dados (usuários, agenda, avisos…)
   │                            └─ fila de e-mails (outbox)
   ├─ a cada minuto: lembretes 24 h e 2 h
   ├─ a cada 15 s: entrega de e-mails (API do Brevo ou SMTP), com novas tentativas
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
| `agendamento_adicionais` | Adicionais de cada horário, com nome e preço do momento da marcação |
| `notificacoes` | Avisos do sino |
| `emails_saida` | Fila de e-mails |
| `biometria_credenciais` | Uma linha por aparelho com biometria: id da credencial, chave pública, contador, tipo de aparelho, datas |
| `biometria_desafios` | Desafios de uso único da biometria (só o hash, valem 5 min) |
| `configuracoes` | Endereço, contatos, regras da agenda (JSON) |
| `auditoria` | Ações do admin e eventos de segurança |
| `migracoes` | Quais arquivos de `servidor/db/migracoes/` já rodaram |

A migração `002_site.sql` tira a tabela de inscrições de notificação push e troca a origem "app" por "site". A `003_catalogo_whatsapp.sql` cria o tipo de serviço (principal ou adicional), o catálogo novo, os adicionais por horário e as filas do WhatsApp. A `004_biometria_sem_robo.sql` apaga as filas e as colunas do robô e cria as tabelas da biometria e o identificador aleatório da conta (`usuarios.biometria_id`). Todas rodam sozinhas em bancos que já tinham a versão anterior.

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
- Biometria com `@simplewebauthn/server`: verificação do usuário obrigatória (digital, rosto ou PIN), origem e domínio conferidos, desafio de uso único guardado só como hash, contador conferido a cada entrada. Ativar pede a senha, a não ser nos 10 min depois de entrar, e manda e-mail de aviso. Entrar sem lista de contas (o aparelho mostra as passkeys deste site).
- Um domínio só: o Caddy redireciona `www.` para o domínio principal (sessão, CSRF e passkeys dependem da origem).

## 7. LGPD

- Coleta mínima: nome, e-mail, telefone opcional no cadastro e obrigatório ao marcar. Aceite registrado com versão; marketing opcional e separado.
- Biometria: nenhum dado biométrico chega ao site; só a chave pública, o tipo de aparelho e as datas. Remover o aparelho ou excluir a conta apaga tudo.
- Só cookies essenciais; fontes e ícones servidos pelo próprio site; mapa do Google só depois do toque.
- Na conta: baixar os dados (JSON) e excluir a conta (anonimiza, cancela horários futuros, mantém o histórico sem dados pessoais).

## 8. E-mails e avisos

| Evento | E-mail | Aviso no sino |
| --- | --- | --- |
| Cadastro | Confirme seu e-mail | Boas-vindas |
| Esqueci a senha | Link de redefinição (1 h) | Não |
| Agendamento | Confirmação com valor, endereço e convite (.ics) | Sim |
| Remarcação | Novo horário | Sim |
| Cancelamento | Pelo cliente ou pelo Fortão, com motivo | Sim |
| Lembrete 24 h e 2 h | Sim | Sim |
| Biometria ativada | Aviso de segurança | Sim |

Sem a chave do Brevo (nem SMTP), os e-mails ficam em `var/emails/` e o painel mostra um aviso; quando o Brevo recusa um envio, o painel mostra a resposta dele. WhatsApp só pelo Fortão, manual, com os botões do painel (seção 9).

## 9. Telas

Cliente: início (agendamento com adicionais), entrar (com senha ou biometria), criar conta, esqueci a senha, redefinir senha, confirmar e-mail, marcar horário (com a confirmação, o mini formulário do celular e os links de termos e privacidade), sucesso com lembrete, minha conta (próximo horário, horários, perfil, biometria, aparência, senha, privacidade), termos, privacidade, LGPD e 404. Botão de tema claro/escuro no topo.

Fortão: agenda do dia, resumo, rendimento (com adicionais separados), novo horário (cliente com conta ou do balcão, com adicionais), concluir, falta, remarcar, cancelar com motivo, Mensagem no WhatsApp com texto pronto e Salvar contato (.vcf) em cada horário e cliente, folgas, serviços e adicionais, horário de funcionamento, dados da barbearia, clientes.

## 10. Fora desta versão

Pagamento online, fidelidade, lista de espera, galeria de cortes, vários barbeiros na tela de marcar. O banco já deixa espaço para eles.
