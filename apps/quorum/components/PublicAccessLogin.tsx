'use client';

import Script from 'next/script';
import { useCallback, useEffect, useState } from 'react';
import { publicApiBase } from '@/lib/api';

export default function PublicAccessLogin({ nextPath }: { nextPath: string }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);

  const finishLogin = useCallback(() => window.location.assign(nextPath), [nextPath]);

  useEffect(() => {
    void fetch(`${publicApiBase}/v1/me`, { credentials: 'include' })
      .then((response) => { if (response.ok) finishLogin(); })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, [finishLogin]);

  const googleLogin = useCallback(async (credential: string) => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${publicApiBase}/v1/auth/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || 'No pudimos autorizar esta cuenta.');
      finishLogin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos iniciar sesión.');
      setBusy(false);
    }
  }, [finishLogin]);

  const renderGoogleButton = useCallback(() => {
    const target = document.getElementById('google-public-access');
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!target || !window.google || !clientId) return;
    target.replaceChildren();
    window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }: { credential: string }) => void googleLogin(credential) });
    window.google.accounts.id.renderButton(target, { theme: 'outline', size: 'large', text: 'continue_with', locale: 'es', width: 300 });
  }, [googleLogin]);

  return (
    <section className="management-login batch-access">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={renderGoogleButton} />
      <div className="login-card">
        <span className="eyebrow">Prueba privada de Quórum</span>
        <h1>Acceso para el equipo de prueba</h1>
        <p>Esta versión todavía no es pública. Ingresá con la cuenta de Google que fue incorporada al batch de evaluación.</p>
        <div id="google-public-access" aria-live="polite" />
        {busy && <p className="message" role="status">Comprobando acceso…</p>}
        {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && <p className="message error">Falta configurar el cliente de Google para este entorno.</p>}
        {message && <p className="message error" role="alert">{message}</p>}
        <small>El acceso a esta prueba no concede permisos para editar o publicar contenidos.</small>
      </div>
    </section>
  );
}
