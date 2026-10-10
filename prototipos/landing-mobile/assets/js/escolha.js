/* Aplica cor de destaque e tema às prévias e aos links "Abrir opção" */
(() => {
  const form = document.querySelectorAll('.segmentado input');
  const aplicar = () => {
    const destaque = document.querySelector('input[name="destaque"]:checked').value;
    const tema = document.querySelector('input[name="tema"]:checked').value;
    const montar = (base) => {
      const p = new URLSearchParams();
      if (destaque) p.set('destaque', destaque);
      if (tema && base.includes('cadeira')) p.set('tema', tema);
      const q = p.toString();
      return q ? `${base}?${q}` : base;
    };
    document.querySelectorAll('[data-previa]').forEach((f) => {
      const url = montar(f.dataset.previa);
      if (f.getAttribute('src') !== url) f.setAttribute('src', url);
    });
    document.querySelectorAll('[data-abrir]').forEach((a) => {
      const base = a.getAttribute('href').split('?')[0];
      a.setAttribute('href', montar(base));
    });
  };
  form.forEach((i) => i.addEventListener('change', aplicar));
})();
