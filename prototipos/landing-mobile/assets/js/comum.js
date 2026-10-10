/* Comportamentos compartilhados pelos protótipos. JS puro, sem dependências. */
(() => {
  const raiz = document.documentElement;
  const params = new URLSearchParams(location.search);
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)');

  // Cor de destaque opcional (?destaque=verde|amarelo). Padrão: só preto e cinza.
  const destaque = params.get('destaque');
  if (destaque === 'verde' || destaque === 'amarelo') raiz.dataset.destaque = destaque;
  const tema = params.get('tema');
  if (tema === 'claro' || tema === 'escuro') raiz.dataset.tema = tema;

  // ----- Menu em tela cheia -------------------------------------------------
  const botaoMenu = document.querySelector('[data-menu-botao]');
  const menu = document.querySelector('[data-menu]');
  if (botaoMenu && menu) {
    const fechar = (devolverFoco = true) => {
      menu.dataset.aberto = 'false';
      botaoMenu.setAttribute('aria-expanded', 'false');
      botaoMenu.querySelector('.sr-only').textContent = 'Abrir menu';
      document.body.style.overflow = '';
      const esconder = () => { if (menu.dataset.aberto === 'false') menu.hidden = true; };
      reduzir.matches ? esconder() : menu.addEventListener('transitionend', esconder, { once: true });
      if (devolverFoco) botaoMenu.focus();
    };
    const abrir = () => {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => { menu.dataset.aberto = 'true'; }));
      botaoMenu.setAttribute('aria-expanded', 'true');
      botaoMenu.querySelector('.sr-only').textContent = 'Fechar menu';
      document.body.style.overflow = 'hidden';
      menu.querySelector('a, button')?.focus({ preventScroll: true });
    };
    botaoMenu.addEventListener('click', () => (botaoMenu.getAttribute('aria-expanded') === 'true' ? fechar() : abrir()));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) fechar(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.dataset.aberto === 'true') fechar(); });
  }

  // ----- Revelar ao entrar na tela ----------------------------------------
  const revelaveis = document.querySelectorAll('[data-revelar]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('visivel'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revelaveis.forEach((el) => io.observe(el));
  } else {
    revelaveis.forEach((el) => el.classList.add('visivel'));
  }

  // ----- Barra fixa "Marcar horário" depois que o hero sai da tela ----------
  const hero = document.querySelector('[data-hero]');
  const barra = document.querySelector('[data-barra]');
  const fim = document.querySelector('[data-fim]');
  if (hero && barra && 'IntersectionObserver' in window) {
    let heroVisivel = true, fimVisivel = false;
    const atualizar = () => {
      const mostrar = !heroVisivel && !fimVisivel;
      barra.dataset.visivel = String(mostrar);
      barra.inert = !mostrar;
    };
    new IntersectionObserver(([en]) => { heroVisivel = en.isIntersecting; atualizar(); }, { threshold: 0.05 }).observe(hero);
    if (fim) new IntersectionObserver(([en]) => { fimVisivel = en.isIntersecting; atualizar(); }, { threshold: 0.2 }).observe(fim);
    atualizar();
  }

  // ----- Topo muda de aparência depois de rolar um pouco -------------------
  const topo = document.querySelector('[data-topo]');
  const sentinela = document.querySelector('[data-sentinela]');
  if (topo && sentinela && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { topo.dataset.rolado = String(!en.isIntersecting); }).observe(sentinela);
  }

  // ----- Sliders com scroll-snap: pontos + setas ----------------------------
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const trilho = slider.querySelector('[data-trilho]');
    const itens = [...trilho.children];
    const pontos = slider.querySelectorAll('[data-ponto]');
    const anterior = slider.querySelector('[data-anterior]');
    const proximo = slider.querySelector('[data-proximo]');
    let atual = 0;
    const marcar = (i) => {
      atual = i;
      pontos.forEach((p, k) => p.setAttribute('aria-current', String(k === i)));
      if (anterior) anterior.disabled = i === 0;
      if (proximo) proximo.disabled = i === itens.length - 1;
    };
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => { if (en.isIntersecting) marcar(itens.indexOf(en.target)); });
    }, { root: trilho, threshold: 0.6 });
    itens.forEach((it) => io.observe(it));
    const ir = (i) => {
      const alvo = itens[Math.max(0, Math.min(itens.length - 1, i))];
      trilho.scrollTo({ left: alvo.offsetLeft - trilho.offsetLeft - parseFloat(getComputedStyle(trilho).scrollPaddingLeft || 0), behavior: reduzir.matches ? 'auto' : 'smooth' });
    };
    anterior?.addEventListener('click', () => ir(atual - 1));
    proximo?.addEventListener('click', () => ir(atual + 1));
    pontos.forEach((p, k) => p.addEventListener('click', () => ir(k)));
    marcar(0);
  });

  // ----- Faixa de frases (marquee): duplica o conteúdo para o loop -----------
  document.querySelectorAll('[data-faixa]').forEach((faixa) => {
    const lista = faixa.querySelector('ul');
    const copia = lista.cloneNode(true);
    copia.setAttribute('aria-hidden', 'true');
    faixa.appendChild(copia);
  });

  // ----- Mapa do Google só depois do toque -----------------------------------
  document.querySelectorAll('[data-mapa]').forEach((caixa) => {
    caixa.querySelector('button')?.addEventListener('click', () => {
      const q = encodeURIComponent(caixa.dataset.mapa);
      caixa.innerHTML = `<iframe title="Mapa: Barbearia do Fortão" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${q}&output=embed"></iframe>`;
    });
  });

  // ----- Ano no rodapé -------------------------------------------------------
  document.querySelectorAll('[data-ano]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
