/* Opção C: prévia funcional do agendamento.
   Tudo aqui é simulação: no app real, dias, horários e confirmação vêm da API (Node + MySQL). */
(() => {
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FECHADO = [0, 1];               // domingo e segunda (exemplo, confirmar com o Fortão)
  const ABRE = { 6: [8, 18] };          // sábado 8h às 18h; demais dias 9h às 20h
  const PADRAO = [9, 20];
  const PASSO = 40;                     // minutos por atendimento (exemplo)
  const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
  const fmtLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });

  // ----- Saudação pelo horário do aparelho -----
  const h = new Date().getHours();
  const saudacao = document.querySelector('[data-saudacao]');
  if (saudacao) saudacao.textContent = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  // ----- Gerador determinístico de horários ocupados (só para a prévia) -----
  const semente = (d) => d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate();
  const ocupado = (d, minutos) => {
    const x = Math.sin(semente(d) * 97 + minutos * 13) * 10000;
    return x - Math.floor(x) < 0.34;
  };
  const horariosDo = (d) => {
    if (FECHADO.includes(d.getDay())) return [];
    const [ini, fim] = ABRE[d.getDay()] || PADRAO;
    const agora = new Date();
    const lista = [];
    for (let m = ini * 60; m + PASSO <= fim * 60; m += PASSO) {
      const passado = d.toDateString() === agora.toDateString() && m <= agora.getHours() * 60 + agora.getMinutes() + 30;
      lista.push({ m, rotulo: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, livre: !passado && !ocupado(d, m) });
    }
    return lista;
  };

  // ----- Dias -----
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Array.from({ length: 12 }, (_, i) => { const d = new Date(hoje); d.setDate(d.getDate() + i); return d; });
  const caixaDias = document.querySelector('[data-dias]');
  const caixaHoras = document.querySelector('[data-horas]');
  const nomeDia = (d, i) => (i === 0 ? 'hoje' : i === 1 ? 'amanhã' : fmtDia.format(d).replace('.', ''));

  dias.forEach((d, i) => {
    const fechado = FECHADO.includes(d.getDay());
    const rotulo = document.createElement('label');
    rotulo.className = 'dia';
    rotulo.innerHTML = `<input type="radio" name="dia" value="${i}" ${fechado ? 'disabled' : ''}>
      <small>${nomeDia(d, i)}</small><b>${d.getDate()}</b>
      <span class="sr-only">${fechado ? 'fechado' : fmtLongo.format(d)}</span>`;
    caixaDias.appendChild(rotulo);
  });

  // ----- Próximo horário livre (chip do hero) -----
  const proximo = (() => {
    for (let i = 0; i < dias.length; i++) {
      const livre = horariosDo(dias[i]).find((x) => x.livre);
      if (livre) return { i, livre };
    }
    return null;
  })();
  const chip = document.querySelector('[data-proximo-livre]');
  if (chip && proximo) chip.textContent = `${nomeDia(dias[proximo.i], proximo.i)}, ${proximo.livre.rotulo}`;

  // ----- Horários do dia escolhido -----
  const form = document.querySelector('[data-agendar]');
  const resumo = document.querySelector('[data-resumo]');
  const confirmar = document.querySelector('[data-confirmar]');

  const montarHoras = (i) => {
    const lista = horariosDo(dias[i]);
    caixaHoras.innerHTML = '';
    if (!lista.some((x) => x.livre)) {
      caixaHoras.innerHTML = '<p class="horas__vazio">Sem horários livres nesse dia. Tenta o próximo.</p>';
      return;
    }
    lista.forEach((x) => {
      const r = document.createElement('label');
      r.className = 'hora';
      r.innerHTML = `<input type="radio" name="hora" value="${x.rotulo}" ${x.livre ? '' : 'disabled'}>${x.rotulo}${x.livre ? '' : '<span class="sr-only"> ocupado</span>'}`;
      caixaHoras.appendChild(r);
    });
  };

  const atualizarResumo = () => {
    const dados = new FormData(form);
    const servico = form.querySelector('input[name="servico"]:checked');
    const i = dados.get('dia');
    const hora = dados.get('hora');
    const pronto = servico && i !== null && hora;
    const texto = pronto
      ? `<b>${servico.value}</b>, ${fmtLongo.format(dias[i]).replace(/\./g, '')} às <b>${hora}</b>, R$ ${servico.dataset.preco}`
      : 'Escolha um horário';
    confirmar.disabled = !pronto;
    if (resumo.innerHTML === texto) return;
    // Troca com um leve desfoque: o olho lê como uma transformação só
    resumo.classList.add('trocando');
    setTimeout(() => { resumo.innerHTML = texto; resumo.classList.remove('trocando'); }, reduzir ? 0 : 120);
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'dia') montarHoras(e.target.value);
    atualizarResumo();
  });

  // Seleção inicial: o próximo dia com horário livre
  if (proximo) {
    form.querySelector(`input[name="dia"][value="${proximo.i}"]`).checked = true;
    montarHoras(proximo.i);
  }
  atualizarResumo();

  // ----- Notificação estilo celular -----
  const aviso = document.querySelector('[data-notificacao]');
  let timer;
  const notificar = (titulo, texto) => {
    aviso.querySelector('[data-notificacao-titulo]').textContent = titulo;
    aviso.querySelector('[data-notificacao-texto]').textContent = texto;
    aviso.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { aviso.dataset.visivel = 'true'; }));
    clearTimeout(timer);
    timer = setTimeout(() => { aviso.dataset.visivel = 'false'; }, 4200);
  };
  // Pausa o tempo de sumir quando a aba fica oculta (detalhe que ninguém nota, mas todo mundo sente)
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (aviso.dataset.visivel === 'true') timer = setTimeout(() => { aviso.dataset.visivel = 'false'; }, 2500); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = new FormData(form);
    notificar('Horário reservado (simulação)', `${dados.get('servico')} às ${dados.get('hora')}. No app real, você recebe a confirmação por e-mail e um lembrete antes.`);
  });
  document.querySelector('[data-avisos]')?.addEventListener('click', () => {
    notificar('Barbearia do Fortão', 'Constância vence talento. Seu próximo corte já pode ser marcado.');
  });

  // ----- Frase do dia -----
  const frases = [
    'Constância vence talento.',
    'Cabelo na régua, mente no lugar.',
    'Disciplina é o meu superpoder.',
    'Corre pelo seu.',
    'Todo dia é dia de ficar na régua.',
    'O espelho mostra a disciplina.',
  ];
  const diaDoAno = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
  let f = diaDoAno % frases.length;
  const caixaFrase = document.querySelector('[data-frase]');
  caixaFrase.textContent = frases[f];
  document.querySelector('[data-outra-frase]')?.addEventListener('click', () => {
    f = (f + 1) % frases.length;
    if (reduzir) { caixaFrase.textContent = frases[f]; return; }
    caixaFrase.classList.add('trocando');
    setTimeout(() => { caixaFrase.textContent = frases[f]; caixaFrase.classList.remove('trocando'); }, 200);
  });
})();
