// Biometria no navegador (passkeys / WebAuthn). A digital, o rosto ou o PIN são conferidos pelo próprio aparelho;
// aqui só convertemos o que vai e volta entre o servidor (texto em base64url) e o navegador (bytes).
import { post } from './api.js';

const paraBytes = (texto) => {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const paraTexto = (buffer) => {
  let s = '';
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const temSuporte = () => typeof window.PublicKeyCredential === 'function' && typeof navigator.credentials?.get === 'function';

/** O aparelho tem leitor de digital, rosto ou PIN de tela (e não só chave de segurança USB)? */
export async function temBiometriaNoAparelho() {
  if (!temSuporte()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

/** Mensagem em português para o que o navegador devolve quando algo não sai como esperado. */
export function erroDaBiometria(e) {
  if (e?.status !== undefined) return e; // erro que já veio do servidor
  const mensagens = {
    NotAllowedError: 'A biometria foi cancelada ou o tempo acabou. Tente de novo.',
    InvalidStateError: 'Esse aparelho já entra com biometria nesta conta.',
    SecurityError: 'A biometria só funciona no endereço oficial do site, com https.',
    NotSupportedError: 'Este navegador não tem suporte a biometria.',
    AbortError: 'A biometria foi cancelada.',
  };
  return { message: mensagens[e?.name] || 'Não deu para usar a biometria agora. Tente de novo.', campos: {}, cancelado: e?.name === 'NotAllowedError' || e?.name === 'AbortError' };
}

const comum = (c) => ({
  id: c.id,
  rawId: paraTexto(c.rawId),
  type: c.type,
  authenticatorAttachment: c.authenticatorAttachment || undefined,
  clientExtensionResults: c.getClientExtensionResults?.() ?? {},
});

/** Entra na conta com a biometria do aparelho. Devolve { usuario } como o login com senha. */
export async function entrarComBiometria() {
  const { opcoes } = await post('/auth/biometria/opcoes');
  const credencial = await navigator.credentials.get({
    publicKey: {
      ...opcoes,
      challenge: paraBytes(opcoes.challenge),
      allowCredentials: (opcoes.allowCredentials || []).map((c) => ({ ...c, id: paraBytes(c.id) })),
    },
  });
  const r = credencial.response;
  return post('/auth/biometria/entrar', {
    resposta: {
      ...comum(credencial),
      response: {
        clientDataJSON: paraTexto(r.clientDataJSON),
        authenticatorData: paraTexto(r.authenticatorData),
        signature: paraTexto(r.signature),
        userHandle: r.userHandle ? paraTexto(r.userHandle) : undefined,
      },
    },
  }).catch((e) => {
    // Passkey de conta excluída ou de aparelho removido: o navegador pode tirar da lista dele (Chrome e outros que já suportam)
    if (e.codigo === 'biometria_desconhecida') PublicKeyCredential.signalUnknownCredential?.({ rpId: location.hostname, credentialId: credencial.id }).catch(() => {});
    throw e;
  });
}

/** Ativa a biometria deste aparelho na conta logada. senha só é pedida se a sessão não for recente. */
export async function ativarBiometria(senha) {
  const { opcoes } = await post('/conta/biometria/opcoes', senha ? { senha } : {});
  const credencial = await navigator.credentials.create({
    publicKey: {
      ...opcoes,
      challenge: paraBytes(opcoes.challenge),
      user: { ...opcoes.user, id: paraBytes(opcoes.user.id) },
      excludeCredentials: (opcoes.excludeCredentials || []).map((c) => ({ ...c, id: paraBytes(c.id) })),
    },
  });
  const r = credencial.response;
  return post('/conta/biometria', {
    resposta: {
      ...comum(credencial),
      response: {
        clientDataJSON: paraTexto(r.clientDataJSON),
        attestationObject: paraTexto(r.attestationObject),
        transports: r.getTransports?.() ?? [],
      },
    },
  });
}
