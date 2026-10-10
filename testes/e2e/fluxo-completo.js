// Fluxo completo no navegador (Playwright): cadastro, agendamento, conta, remarcação e painel do admin.
// Uso: com o servidor rodando, `npm run e2e`. Variáveis: URL_BASE, ADMIN_EMAIL, ADMIN_SENHA, PASTA_FOTOS.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.URL_BASE || 'http://localhost:3000';
const FOTOS = process.env.PASTA_FOTOS || 'var/e2e';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'fortao@exemplo.com.br', senha: process.env.ADMIN_SENHA || 'Disciplina!Cohab5' };
await mkdir(FOTOS, { recursive: true });

const navegador = await chromium.launch();
const erros = [];
async function novaPagina(tema = 'dark') {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: tema, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) erros.push(`console: ${m.text()}`); });
  return p;
}
const foto = (p, nome, inteira = false) => p.screenshot({ path: `${FOTOS}/${nome}.png`, fullPage: inteira });
const passo = (t) => console.log(`- ${t}`);

// 1. Visitante escolhe um horário na página inicial
const p = await novaPagina();
await p.goto(BASE, { waitUntil: 'networkidle' });
await foto(p, '01-inicio');
await p.locator('.ag-servico').nth(2).click();
await p.waitForSelector('.ag-hora');
await p.locator('.ag-dia:not(:has(input:disabled))').nth(1).click();
await p.waitForSelector('.ag-hora');
await p.locator('.ag-hora').nth(2).click();
await p.locator('.ag button[type="submit"]').scrollIntoViewIfNeeded();
await foto(p, '02-escolha');
await p.locator('.ag button[type="submit"]').click();
await p.waitForSelector('[data-folha-entrar][open]');
await p.waitForTimeout(400);
await foto(p, '03-falta-entrar');
passo('visitante escolheu serviço, dia e horário; app pediu para entrar');

// 2. Cria a conta e volta para confirmar
await p.click('[data-folha-entrar] a[href^="/cadastro"]');
await p.waitForURL(/\/cadastro/);
const email = `teste.e2e+${Date.now()}@exemplo.com.br`;
await p.fill('#nome', 'Rafael Teste');
await p.fill('#email', email);
await p.fill('#telefone', '11987654321');
await p.fill('#senha', 'CorteNaRegua!2026');
await p.check('input[name="aceite"]');
await foto(p, '04-cadastro');
await p.click('form [type="submit"]');
await p.waitForURL(/\/agendar/);
await p.waitForSelector('.ag-hora input:checked', { timeout: 10000 });
await foto(p, '05-agendar-guardado');
await p.click('.ag button[type="submit"]');
await p.waitForSelector('[data-folha-sucesso][open]');
await p.waitForTimeout(500);
await foto(p, '06-sucesso');
passo('conta criada e horário confirmado com a escolha guardada');

// 3. Minha conta: horário aparece; remarca
await p.click('[data-folha-sucesso] a[href="/conta#horarios"]');
await p.waitForURL(/\/conta/);
await p.waitForSelector('.horario');
assert.equal(await p.locator('.horario').count(), 1);
await foto(p, '07-conta-horarios');
await p.click('.horario button:has-text("Remarcar")');
await p.waitForSelector('[data-folha-remarcar][open] .ag-hora');
// Um dia mais à frente: no fim do dia, hoje pode ter poucos horários
await p.locator('[data-folha-remarcar] .ag-dia:not(:has(input:disabled))').nth(2).click();
await p.waitForSelector('[data-folha-remarcar] .ag-hora');
await p.locator('[data-folha-remarcar] .ag-hora').nth(1).click();
await p.waitForTimeout(300);
await foto(p, '08-remarcar');
await p.click('[data-folha-remarcar] button[type="submit"]');
await p.waitForSelector('[data-toast][data-visivel="true"]');
assert.match(await p.textContent('[data-toast-titulo]'), /remarcado/i);
passo('horário aparece na conta e foi remarcado');

// 4. Avisos no sino
await p.click('[data-avisos-botao]');
await p.waitForSelector('[data-avisos-painel][data-aberto="true"] .aviso-item');
await p.waitForTimeout(300);
await foto(p, '09-avisos');
await p.click('[data-avisos-fechar]');
passo('central de avisos mostra confirmação e remarcação');

// 5. Perfil com tema claro e letra grande
await p.goto(`${BASE}/conta#perfil`, { waitUntil: 'networkidle' });
await p.click('label:has(input[value="claro"])');
await p.check('[data-letra-grande]');
await p.waitForTimeout(400);
await foto(p, '10-perfil-claro');
assert.equal(await p.getAttribute('html', 'data-tema'), 'claro');
await p.click('label:has(input[value="escuro"])');
await p.uncheck('[data-letra-grande]');
passo('tema claro e letra grande aplicados e salvos');

// 6. Fortão entra e vê o horário no painel
const a = await novaPagina();
await a.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' });
await foto(a, '11-entrar');
await a.fill('#email', ADMIN.email);
await a.fill('#senha', ADMIN.senha);
await a.click('form [type="submit"]');
await a.waitForURL(/\/admin/);
await a.waitForSelector('.resumo__item');
await foto(a, '12-painel');
const dias = await (await a.request.get(`${BASE}/api/conta/agendamentos`)).json().catch(() => null);
assert.ok(dias, 'admin com sessão');
await a.click('[data-novo-abrir]');
await a.waitForSelector('[data-folha-novo][open]');
await a.waitForTimeout(500);
await foto(a, '13-novo-horario');
await a.click('[data-folha-novo] [data-fechar]');
for (const s of ['servicos', 'funcionamento', 'barbearia']) {
  await a.goto(`${BASE}/admin#${s}`, { waitUntil: 'networkidle' });
  await a.waitForTimeout(400);
  await foto(a, `14-painel-${s}`);
}
passo('painel do Fortão abre com resumo, agenda e configurações');

// 7. Páginas legais
const l = await novaPagina();
await l.goto(`${BASE}/privacidade`, { waitUntil: 'networkidle' });
await foto(l, '15-privacidade');
await l.goto(`${BASE}/nao-existe`, { waitUntil: 'networkidle' });
await foto(l, '16-404');

await foto(p, '17-conta-final');
await navegador.close();
assert.deepEqual(erros, [], `erros no navegador:\n${erros.join('\n')}`);
console.log(`\nFluxo completo OK. Capturas em ${FOTOS}/`);
