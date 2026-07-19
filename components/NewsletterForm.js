'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_BLOG_API_BASE_URL || '';

export default function NewsletterForm({ initialStatus = '' }) {
  const initialResult = newsletterResult(initialStatus);
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [resultModalOpen, setResultModalOpen] = useState(Boolean(initialResult));

  useEffect(() => {
    if (!resultModalOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeResultModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [resultModalOpen]);

  function closeResultModal() {
    setResultModalOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('newsletter');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

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
      {resultModalOpen && initialResult && (
        <div className="newsletter-result-overlay" onMouseDown={closeResultModal} role="presentation">
          <div
            aria-describedby="newsletter-result-message"
            aria-labelledby="newsletter-result-title"
            aria-modal="true"
            className={`newsletter-result-modal ${initialResult.tone}`}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button aria-label="Cerrar" className="newsletter-result-close" onClick={closeResultModal} type="button">
              <span aria-hidden="true" className="material-symbols-outlined">close</span>
            </button>
            <span aria-hidden="true" className="newsletter-result-icon material-symbols-outlined">{initialResult.icon}</span>
            <span className="newsletter-result-eyebrow">Newsletter</span>
            <h2 id="newsletter-result-title">{initialResult.title}</h2>
            <p id="newsletter-result-message">{initialResult.message}</p>
            <button className="btn btn-primary" onClick={closeResultModal} type="button">Entendido</button>
          </div>
        </div>
      )}
    </form>
  );
}

function newsletterResult(status) {
  if (status === 'confirmado') {
    return {
      tone: 'success',
      icon: 'check_circle',
      title: 'Listo, suscripcion confirmada',
      message: 'A partir de ahora vas a recibir las novedades de Politeia.',
    };
  }
  if (status === 'baja') {
    return {
      tone: 'neutral',
      icon: 'check_circle',
      title: 'Suscripcion cancelada',
      message: 'Tu email fue retirado del newsletter correctamente.',
    };
  }
  if (status === 'error') {
    return {
      tone: 'error',
      icon: 'error',
      title: 'No pudimos completar la accion',
      message: 'El enlace no es valido o vencio. Podes solicitar uno nuevo desde el formulario.',
    };
  }
  return null;
}
