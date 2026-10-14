// Páginas legais e 404: casca comum + dados da empresa vindos do painel.
import { iniciarCasca, obterConfig } from './casca.js';

await iniciarCasca();
const cfg = await obterConfig();
if (cfg) {
  const n = cfg.negocio;
  // Razão social e CNPJ só aparecem quando o Fortão cadastra no painel
  const empresa = [n.razao_social, n.cnpj && `CNPJ ${n.cnpj}`].filter(Boolean).join(', ');
  document.querySelectorAll('[data-config-empresa]').forEach((e) => { e.textContent = empresa ? ` (${empresa})` : ''; });
  document.querySelectorAll('[data-config-cancelar]').forEach((e) => { e.textContent = String(cfg.agenda.cancelar_ate_horas); });
  const email = n.email_contato;
  document.querySelectorAll('[data-config-email]').forEach((e) => {
    if (email) { e.href = `mailto:${email}`; e.textContent = `pelo e-mail ${email}`; } else { e.removeAttribute('href'); e.textContent = 'pelos canais da barbearia'; }
  });
  const encarregado = n.encarregado_email || email;
  document.querySelectorAll('[data-config-encarregado]').forEach((e) => {
    if (encarregado) { e.href = `mailto:${encarregado}`; e.textContent = encarregado; } else { e.removeAttribute('href'); e.textContent = 'e-mail a ser informado pela barbearia'; }
  });
  document.querySelectorAll('[data-config-whatsapp]').forEach((e) => { if (n.whatsapp) e.textContent = ` ou pelo WhatsApp ${n.whatsapp.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')}`; });
}
