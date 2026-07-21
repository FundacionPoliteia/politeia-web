'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_BLOG_API_BASE_URL || '';
const DEFAULT_TOPICS = { newsletter: true, newPosts: true };

export default function NewsletterForm({ initialStatus = '', initialEmail = '', initialToken = '' }) {
  const initialResult = newsletterResult(initialStatus);
  const [email, setEmail] = useState(initialEmail);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [topics, setTopics] = useState(DEFAULT_TOPICS);
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(initialStatus === 'preferencias');
  const [preferencesToken] = useState(initialToken);
  const [preferencesEmail, setPreferencesEmail] = useState(initialEmail);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(Boolean(initialResult));

  useEffect(() => {
    if (!preferencesOpen || !preferencesToken || preferencesLoaded) return;
    let active = true;
    setStatus('loading');
    fetch(`${API_BASE}/v1/newsletter/preferences?token=${encodeURIComponent(preferencesToken)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || 'No pudimos cargar tus preferencias.');
        if (!active) return;
        setPreferencesEmail(data.email || initialEmail);
        setTopics({ newsletter: data.topics?.newsletter !== false, newPosts: data.topics?.newPosts !== false });
        setPreferencesLoaded(true);
        setStatus('idle');
      })
      .catch((err) => {
        if (!active) return;
        setStatus('error');
        setMessage(err.message);
      });
    return () => { active = false; };
  }, [initialEmail, preferencesLoaded, preferencesOpen, preferencesToken]);

  useEffect(() => {
    if (!resultModalOpen && !subscribeModalOpen && !preferencesOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeAllModals();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [preferencesOpen, resultModalOpen, subscribeModalOpen]);

  function cleanNewsletterUrl() {
    const url = new URL(window.location.href);
    ['newsletter', 'email', 'token'].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function closeAllModals() {
    setResultModalOpen(false);
    setSubscribeModalOpen(false);
    setPreferencesOpen(false);
    cleanNewsletterUrl();
  }

  function onSubmit(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setTopics(DEFAULT_TOPICS);
    setSubscribeModalOpen(true);
    setMessage('');
  }

  async function confirmSubscription() {
    if (status === 'loading' || (!topics.newsletter && !topics.newPosts)) return;
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/v1/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website, source: 'blog', locale: 'es-AR', topics }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos registrar tu email.');
      setStatus('success');
      setMessage(data.message || 'Revisa tu email para confirmar la suscripcion.');
      setSubscribeModalOpen(false);
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'No pudimos registrar tu email. Intenta nuevamente.');
    }
  }

  async function requestPreferencesLink() {
    if (!preferencesEmail.trim() || status === 'loading') return;
    await preferenceRequest('/v1/newsletter/preferences/request', {
      email: preferencesEmail,
    }, 'Revisa tu email para abrir tus preferencias.');
  }

  async function savePreferences(nextTopics = topics) {
    if (!preferencesToken || status === 'loading') return;
    await preferenceRequest('/v1/newsletter/preferences', {
      token: preferencesToken,
      topics: nextTopics,
    }, nextTopics.newsletter || nextTopics.newPosts ? 'Preferencias actualizadas.' : 'Te diste de baja de todos los envios.', 'PATCH');
  }

  async function preferenceRequest(path, body, successMessage, method = 'POST') {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos actualizar tus preferencias.');
      setStatus('success');
      setMessage(successMessage);
      if (preferencesToken) setPreferencesLoaded(true);
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'No pudimos actualizar tus preferencias.');
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
        <input aria-hidden="true" autoComplete="off" className="newsletter-honeypot" name="website" tabIndex="-1" value={website} onChange={(event) => setWebsite(event.target.value)} />
        <button disabled={status === 'loading' || !email.trim()} type="submit">Suscribirme</button>
      </div>
      {message && !preferencesOpen && (
        <p className={`news-form-status ${status}`} id="newsletter-status" role={status === 'error' ? 'alert' : 'status'}>{message}</p>
      )}

      {subscribeModalOpen && (
        <NewsletterModal eyebrow="Preferencias" title="Que queres recibir" onClose={closeAllModals}>
          <p>Ambas opciones estan activadas. Podes cambiarlas antes de solicitar la confirmacion.</p>
          <TopicChoices topics={topics} setTopics={setTopics} />
          {!topics.newsletter && !topics.newPosts && <p className="newsletter-preferences-warning">Elegi al menos una opcion para continuar.</p>}
          <div className="newsletter-preferences-actions">
            <button className="btn btn-ghost" disabled={status === 'loading'} onClick={closeAllModals} type="button">Cancelar</button>
            <button className="btn btn-primary" disabled={status === 'loading' || (!topics.newsletter && !topics.newPosts)} onClick={confirmSubscription} type="button">
              {status === 'loading' ? 'Enviando...' : 'Confirmar preferencias'}
            </button>
          </div>
        </NewsletterModal>
      )}

      {preferencesOpen && (
        <NewsletterModal eyebrow="Preferencias" title="Tus envios de Politeia" onClose={closeAllModals}>
          {!preferencesToken ? (
            <>
              <p>Te enviaremos un enlace seguro para consultar y actualizar tus opciones.</p>
              <label className="newsletter-preferences-email">
                Email
                <input type="email" value={preferencesEmail} onChange={(event) => setPreferencesEmail(event.target.value)} placeholder="tu@email.com" />
              </label>
              <button className="btn btn-primary" disabled={status === 'loading' || !preferencesEmail.trim()} onClick={requestPreferencesLink} type="button">
                {status === 'loading' ? 'Enviando...' : 'Enviar enlace seguro'}
              </button>
            </>
          ) : status === 'loading' && !preferencesLoaded ? (
            <div className="newsletter-preferences-loading" role="status"><span className="admin-spinner" aria-hidden="true" /> Cargando preferencias...</div>
          ) : (
            <>
              <p className="newsletter-preferences-account">Preferencias para <strong>{preferencesEmail}</strong></p>
              <TopicChoices topics={topics} setTopics={setTopics} />
              <div className="newsletter-preferences-actions">
                <button className="btn btn-ghost danger" disabled={status === 'loading'} onClick={() => savePreferences({ newsletter: false, newPosts: false })} type="button">Desuscribirme de todo</button>
                <button className="btn btn-primary" disabled={status === 'loading'} onClick={() => savePreferences(topics)} type="button">{status === 'loading' ? 'Guardando...' : 'Guardar preferencias'}</button>
              </div>
            </>
          )}
          {message && <p className={`news-form-status ${status}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
        </NewsletterModal>
      )}

      {resultModalOpen && initialResult && (
        <NewsletterModal eyebrow="Newsletter" icon={initialResult.icon} title={initialResult.title} tone={initialResult.tone} onClose={closeAllModals}>
          <p>{initialResult.message}</p>
          <button className="btn btn-primary" onClick={closeAllModals} type="button">Entendido</button>
        </NewsletterModal>
      )}
    </form>
  );
}

function TopicChoices({ topics, setTopics }) {
  return (
    <div className="newsletter-topic-choices">
      <label>
        <input checked={topics.newsletter} onChange={(event) => setTopics((current) => ({ ...current, newsletter: event.target.checked }))} type="checkbox" />
        <span><strong>Newsletter y novedades</strong><small>Selecciones editoriales, proyectos y noticias de Politeia.</small></span>
      </label>
      <label>
        <input checked={topics.newPosts} onChange={(event) => setTopics((current) => ({ ...current, newPosts: event.target.checked }))} type="checkbox" />
        <span><strong>Nuevas notas del blog</strong><small>Avisos cuando publicamos nuevas lecturas, con frecuencia limitada.</small></span>
      </label>
    </div>
  );
}

function NewsletterModal({ eyebrow, icon = '', title, tone = 'neutral', onClose, children }) {
  return (
    <div className="newsletter-result-overlay" onMouseDown={onClose} role="presentation">
      <div aria-modal="true" className={`newsletter-result-modal newsletter-preferences-modal ${tone}`} onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <button aria-label="Cerrar" className="newsletter-result-close" onClick={onClose} type="button"><span aria-hidden="true" className="material-symbols-outlined">close</span></button>
        {icon && <span aria-hidden="true" className="newsletter-result-icon material-symbols-outlined">{icon}</span>}
        <span className="newsletter-result-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function newsletterResult(status) {
  if (status === 'confirmado') return { tone: 'success', icon: 'check_circle', title: 'Listo, suscripcion confirmada', message: 'A partir de ahora vas a recibir las novedades que elegiste.' };
  if (status === 'baja') return { tone: 'neutral', icon: 'check_circle', title: 'Suscripcion cancelada', message: 'Tu email fue retirado correctamente.' };
  if (status === 'error') return { tone: 'error', icon: 'error', title: 'No pudimos completar la accion', message: 'El enlace no es valido o vencio. Podes solicitar uno nuevo desde el formulario.' };
  return null;
}
