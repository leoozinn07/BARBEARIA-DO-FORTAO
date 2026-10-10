// Gera os PNGs a partir dos SVGs da logo (ícones do app, favicon, logo dos e-mails).
// Ferramenta de desenvolvimento: precisa do Playwright instalado (npx playwright). Os PNGs gerados vão para o repositório.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(RAIZ, 'publico', 'img');
const { chromium } = await import('playwright');

const svg = async (nome) => `data:image/svg+xml;base64,${(await readFile(path.join(IMG, nome))).toString('base64')}`;
const icone = await svg('icone-app.svg');
const braco = await svg('braco.svg');
const fonte = `data:font/woff2;base64,${(await readFile(path.join(RAIZ, 'publico', 'fontes', 'archivo-latin-standard-normal.woff2'))).toString('base64')}`;

const alvos = [
  { arquivo: 'icone-512.png', w: 512, h: 512, html: `<img src="${icone}" style="width:512px;height:512px">` },
  { arquivo: 'icone-192.png', w: 192, h: 192, html: `<img src="${icone}" style="width:192px;height:192px">` },
  { arquivo: 'apple-touch-icon.png', w: 180, h: 180, html: `<img src="${icone}" style="width:180px;height:180px">` },
  // Maskable: o Android recorta em círculo ou gota; o braço fica dentro da zona segura (80% central)
  { arquivo: 'icone-maskable-512.png', w: 512, h: 512, html: `<div style="width:512px;height:512px;background:linear-gradient(#26262a,#0b0b0c);display:grid;place-items:center"><img src="${braco}" style="width:290px"></div>` },
  { arquivo: 'favicon-32.png', w: 32, h: 32, html: `<div style="width:32px;height:32px;display:grid;place-items:center"><img src="${braco}" style="height:31px"></div>`, transparente: true },
  { arquivo: 'email-logo.png', w: 380, h: 96, html: `<style>@font-face{font-family:A;src:url(${fonte});font-weight:100 900;font-stretch:62% 125%}</style>
      <div style="width:380px;height:96px;background:#0b0b0c;display:flex;align-items:center;gap:14px;font-family:A">
        <img src="${braco}" style="height:84px"><span style="display:grid;line-height:.9;color:#ededee">
        <small style="font-size:15px;font-weight:600;letter-spacing:.24em;color:#a5a5ac">BARBEARIA DO</small>
        <b style="font-size:46px;font-weight:900;font-stretch:125%;letter-spacing:-.02em">FORTÃO</b></span></div>` },
];

const navegador = await chromium.launch();
for (const a of alvos) {
  const pagina = await navegador.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
  await pagina.setContent(`<html><body style="margin:0;background:transparent">${a.html}</body></html>`);
  await pagina.waitForTimeout(300);
  await writeFile(path.join(IMG, a.arquivo), await pagina.screenshot({ omitBackground: Boolean(a.transparente) }));
  await pagina.close();
  console.log('gerado', a.arquivo);
}
await navegador.close();
