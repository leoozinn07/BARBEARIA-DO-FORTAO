// Monta as páginas HTML trocando <!-- incluir:nome --> pelos pedaços em servidor/partes/.
// O navegador recebe HTML completo e semântico; o cabeçalho, as abas e o rodapé ficam num lugar só.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RAIZ, config } from './config.js';

const PUBLICO = path.join(RAIZ, 'publico');
const PARTES = path.join(RAIZ, 'servidor', 'partes');
const cache = new Map();

async function parte(nome) {
  return readFile(path.join(PARTES, `${nome}.html`), 'utf8');
}

export async function montarPagina(nome) {
  if (config.producao && cache.has(nome)) return cache.get(nome);
  const arquivo = path.join(PUBLICO, `${nome}.html`);
  if (!/^[a-z0-9-]+$/.test(nome) || !existsSync(arquivo)) return null;
  let html = await readFile(arquivo, 'utf8');
  const nomes = [...new Set([...html.matchAll(/<!--\s*incluir:([a-z-]+)\s*-->/g)].map((m) => m[1]))];
  for (const n of nomes) {
    const conteudo = await parte(n);
    html = html.replaceAll(new RegExp(`<!--\\s*incluir:${n}\\s*-->`, 'g'), conteudo.trim());
  }
  if (config.producao) cache.set(nome, html);
  return html;
}

/** Middleware: /, /entrar, /conta.html ... viram páginas montadas. Outros arquivos seguem para o estático. */
export async function servirPaginas(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const m = req.path.match(/^\/([a-z0-9-]*?)(?:\.html)?$/);
  if (!m) return next();
  try {
    const html = await montarPagina(m[1] || 'index');
    if (!html) return next();
    res.type('html').set('Cache-Control', 'no-cache').send(html);
  } catch (e) {
    next(e);
  }
}
