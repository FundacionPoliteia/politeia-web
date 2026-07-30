'use client';

import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_BLOG_API_BASE_URL || '';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function TeamApplicationForm() {
  const widgetRef = useRef(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return undefined;
    window.onPoliteiaTurnstileSuccess = (token) => setTurnstileToken(token);
    window.onPoliteiaTurnstileExpired = () => setTurnstileToken('');
    return () => {
      delete window.onPoliteiaTurnstileSuccess;
      delete window.onPoliteiaTurnstileExpired;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const formData = new FormData(event.currentTarget);
      formData.set('turnstileToken', turnstileToken);
      const storageKey = 'politeia:application-idempotency';
      let idempotencyKey = window.sessionStorage.getItem(storageKey);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        window.sessionStorage.setItem(storageKey, idempotencyKey);
      }
      const response = await fetch(`${API_BASE}/v1/applications`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos enviar tu postulacion');
      window.sessionStorage.removeItem(storageKey);
      setSent(true);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError.message);
      window.turnstile?.reset(widgetRef.current);
      setTurnstileToken('');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section className="application-success" role="status">
        <span aria-hidden="true" className="material-symbols-outlined">check_circle</span>
        <h2>Recibimos tu postulacion</h2>
        <p>Gracias por querer sumarte. El equipo va a revisar la informacion enviada.</p>
      </section>
    );
  }

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <script async defer src="https://challenges.cloudflare.com/turnstile/v0/api.js" />
      )}
      <form className="application-form" encType="multipart/form-data" onSubmit={submit}>
        <div className="application-form-grid">
          <label>
            Nombre y apellido
            <input autoComplete="name" maxLength="160" name="fullName" required />
          </label>
          <label>
            Email
            <input autoComplete="email" maxLength="254" name="email" required type="email" />
          </label>
          <label>
            Telefono <small>Opcional</small>
            <input autoComplete="tel" maxLength="40" name="phone" type="tel" />
          </label>
          <label>
            LinkedIn <small>Opcional</small>
            <input maxLength="500" name="linkedinUrl" placeholder="https://linkedin.com/in/..." type="url" />
          </label>
        </div>
        <label>
          Area de interes
          <select name="area" required>
            <option value="">Selecciona un area</option>
            <option>Comunicacion y contenidos</option>
            <option>Desarrollo institucional</option>
            <option>Investigacion y analisis</option>
            <option>Proyectos y participacion</option>
            <option>Tecnologia y datos</option>
            <option>Otra</option>
          </select>
        </label>
        <label>
          Contanos por que queres sumarte
          <textarea maxLength="4000" minLength="20" name="message" required rows="7" />
        </label>
        <label className="application-file">
          CV
          <input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" name="cv" required type="file" />
          <small>PDF o DOCX, hasta 5 MB.</small>
        </label>
        <input aria-hidden="true" autoComplete="off" className="application-honeypot" name="website" tabIndex="-1" />
        <label className="application-consent">
          <input name="consent" required type="checkbox" value="true" />
          <span>Acepto que Fundacion Politeia almacene y revise esta informacion.</span>
        </label>
        {TURNSTILE_SITE_KEY && (
          <div
            className="cf-turnstile"
            data-callback="onPoliteiaTurnstileSuccess"
            data-expired-callback="onPoliteiaTurnstileExpired"
            data-sitekey={TURNSTILE_SITE_KEY}
            ref={widgetRef}
          />
        )}
        {error && <div className="application-form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy || (TURNSTILE_SITE_KEY && !turnstileToken)} type="submit">
          {busy ? 'Enviando postulacion...' : 'Enviar postulacion'}
        </button>
      </form>
    </>
  );
}
