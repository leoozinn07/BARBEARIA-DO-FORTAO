// Service worker: página offline, arquivos do app em cache e notificações push.
// A API nunca é guardada em cache: horário livre e dados da conta sempre vêm frescos do servidor.
const VERSAO = 'fortao-v1';
const ESSENCIAIS = [
  '/offline',
  '/css/base.css', '/css/agenda.css', '/css/inicio.css', '/css/paginas.css',
  '/js/tema.js', '/js/api.js', '/js/ui.js', '/js/casca.js', '/js/agendamento.js',
  '/fontes/geist-latin-wght-normal.woff2', '/fontes/archivo-latin-standard-normal.woff2',
  '/icones/regular/style.css', '/icones/regular/Phosphor.woff2',
  '/img/braco.svg', '/img/icone-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Páginas: rede primeiro; sem internet, a página offline
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/offline')));
    return;
  }
  // Arquivos estáticos: responde do cache e atualiza por trás
  e.respondWith(caches.open(VERSAO).then(async (cache) => {
    const guardado = await cache.match(request);
    const daRede = fetch(request).then((r) => { if (r.ok) cache.put(request, r.clone()); return r; }).catch(() => guardado);
    return guardado || daRede;
  }));
});

self.addEventListener('push', (e) => {
  let dados = {};
  try { dados = e.data ? e.data.json() : {}; } catch { dados = { corpo: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(dados.titulo || 'Barbearia do Fortão', {
    body: dados.corpo || '',
    icon: '/img/icone-192.png',
    badge: '/img/favicon-32.png',
    tag: dados.tag,
    lang: 'pt-BR',
    data: { link: dados.link || '/conta' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.link || '/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    const aberta = janelas.find((j) => j.url.startsWith(location.origin));
    if (aberta) { aberta.navigate(destino); return aberta.focus(); }
    return self.clients.openWindow(destino);
  }));
});
