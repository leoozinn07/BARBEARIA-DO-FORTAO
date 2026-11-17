// Monta o app Express: segurança, páginas estáticas, API e erros.
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import { RAIZ, config } from './config.js';
import { cabecalhos, politicaPermissoes } from './middlewares/cabecalhos.js';
import { protegerCsrf } from './middlewares/csrf.js';
import { apiNaoEncontrada, paginaNaoEncontrada, tratarErros } from './middlewares/erros.js';
import { limites } from './middlewares/limites.js';
import { carregarSessao } from './middlewares/sessao.js';
import { prepararBanco } from './db/preparar.js';
import { log } from './lib/log.js';
import { ErroApp } from './lib/erros.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasAuth } from './rotas/auth.js';
import { rotasConta } from './rotas/conta.js';
import { rotasPublicas } from './rotas/publico.js';
import { servirPaginas } from './paginas.js';
import { rotinasNoCaminho } from './servicos/rotinas.js';

const PUBLICO = path.join(RAIZ, 'publico');

// Banco pronto antes de qualquer coisa que use dados (na Vercel, o primeiro pedido de cada instância cria/atualiza as tabelas)
async function garantirBanco(_req, _res, next) {
  try {
    await prepararBanco();
    next();
  } catch (e) {
    log.erro('banco_indisponivel', { erro: e.message });
    next(new ErroApp(503, 'O sistema está fora do ar por um instante. Tente de novo em alguns minutos.', { codigo: 'banco' }));
  }
}

export function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.confiarProxy);
  app.use(cabecalhos, politicaPermissoes, compression());

  // Páginas que exigem login: redireciona antes de mostrar a página vazia
  const exigirPagina = (papel) => [cookieParser(), carregarSessao, (req, res, next) => {
    if (!req.usuario) return res.redirect(302, `/entrar?volta=${encodeURIComponent(req.originalUrl)}`);
    if (papel && req.usuario.papel !== papel) return res.redirect(302, '/conta');
    next();
  }];
  app.use(['/conta', '/conta.html', '/admin', '/admin.html', '/api'], garantirBanco);
  app.get(['/conta', '/conta.html'], ...exigirPagina());
  app.get(['/admin', '/admin.html'], ...exigirPagina('admin'));

  app.use(servirPaginas);
  app.use(express.static(PUBLICO, {
    index: false,
    setHeaders(res, arquivo) {
      if (arquivo.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.(woff2|png|jpg|webp|svg|ico)$/.test(arquivo)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  }));

  const api = express.Router();
  api.use(limites.api, express.json({ limit: '32kb' }), cookieParser(), carregarSessao, protegerCsrf, rotinasNoCaminho);
  api.use(rotasPublicas);
  api.use('/auth', rotasAuth);
  api.use('/admin', rotasAdmin);
  api.use(rotasConta); // por último: tudo daqui em diante exige login
  api.use(apiNaoEncontrada);
  app.use('/api', api);

  app.use(paginaNaoEncontrada);
  app.use(tratarErros);
  return app;
}
