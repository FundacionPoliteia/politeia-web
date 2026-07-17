'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_BLOG_API_BASE_URL || '';

export default function NewsletterForm({ initialStatus = '' }) {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState(() => initialStatusMessage(initialStatus));

  async function onSubmit(event) {
    event.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/v1/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website, source: 'blog', locale: 'es-AR' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos registrar tu email.');
      setStatus('success');
      setMessage(data.message || 'Revisa tu email para confirmar la suscripcion.');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'No pudimos registrar tu email. Intenta nuevamente.');
    }
  }

  return (
    <form className="news-form" onSubmit={onSubmit} noValidate>
      <div className="news-form-fields">
        <label className="sr-only" htmlFor="newsletter-email">Email</label>
        <input
          aria-describedby={message ? 'newsletter-status' : undefined}
          disabled={status === 'loading'}
          id="newsletter-email"
          type="email"
          placeholder="tu@email.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          aria-hidden="true"
          autoComplete="off"
          className="newsletter-honeypot"
          name="website"
          tabIndex="-1"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
        <button disabled={status === 'loading' || !email.trim()} type="submit">
          {status === 'loading' ? 'Enviando...' : 'Suscribirme'}
        </button>
      </div>
      {message && (
        <p className={`news-form-status ${status}`} id="newsletter-status" role={status === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      )}
    </form>
  );
}

function initialStatusMessage(status) {
  if (status === 'confirmado') return 'Suscripcion confirmada. Ya podes recibir novedades de Politeia.';
  if (status === 'baja') return 'La suscripcion fue cancelada correctamente.';
  if (status === 'error') return 'El enlace no es valido o vencio. Podes intentarlo nuevamente.';
  return '';
}
