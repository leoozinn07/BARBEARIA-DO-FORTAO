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
import { rotasAdmin } from './rotas/admin.js';
import { rotasAuth } from './rotas/auth.js';
import { rotasConta } from './rotas/conta.js';
import { rotasPublicas } from './rotas/publico.js';
import { rotasWhatsapp } from './rotas/whatsapp.js';
import { servirPaginas } from './paginas.js';

const PUBLICO = path.join(RAIZ, 'publico');

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

  // WhatsApp: a Meta chama este endereço quando um cliente responde (fora da API comum, sem sessão e sem CSRF)
  app.use('/api/whatsapp/webhook', limites.api, rotasWhatsapp);

  const api = express.Router();
  api.use(limites.api, express.json({ limit: '32kb' }), cookieParser(), carregarSessao, protegerCsrf);
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
