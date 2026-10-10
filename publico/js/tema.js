// Roda antes de pintar a tela: aplica tema e letra grande guardados no aparelho (sem piscar).
(function () {
  var raiz = document.documentElement;
  raiz.classList.remove('no-js');
  raiz.classList.add('js');
  try {
    var tema = localStorage.getItem('fortao:tema');
    if (tema === 'claro' || tema === 'escuro' || tema === 'auto') raiz.setAttribute('data-tema', tema);
    if (localStorage.getItem('fortao:letra') === 'grande') raiz.setAttribute('data-letra', 'grande');
  } catch (e) { /* armazenamento bloqueado: segue com o padrão */ }
})();
