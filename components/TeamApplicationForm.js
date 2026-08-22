'use client';

import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_BLOG_API_BASE_URL || '';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function TeamApplicationForm() {
  const formRef = useRef(null);
  const widgetRef = useRef(null);
  const tokenRef = useRef('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return undefined;
    window.onPoliteiaTurnstileSuccess = (token) => {
      tokenRef.current = token;
      setTurnstileToken(token);
      setVerifying(false);
      window.setTimeout(() => formRef.current?.requestSubmit(), 0);
    };
    window.onPoliteiaTurnstileExpired = () => {
      tokenRef.current = '';
      setTurnstileToken('');
    };
    window.onPoliteiaTurnstileError = () => {
      tokenRef.current = '';
      setTurnstileToken('');
      setVerifying(false);
      setError('No pudimos completar la verificación de seguridad. Intentá nuevamente.');
    };
    return () => {
      delete window.onPoliteiaTurnstileSuccess;
      delete window.onPoliteiaTurnstileExpired;
      delete window.onPoliteiaTurnstileError;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (TURNSTILE_SITE_KEY && !tokenRef.current) {
      setError('');
      if (!turnstileReady || !window.turnstile) {
        setError('La verificación de seguridad todavía está cargando. Intentá nuevamente en un momento.');
        return;
      }
      setVerifying(true);
      window.turnstile.execute(widgetRef.current);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const formData = new FormData(event.currentTarget);
      formData.set('turnstileToken', tokenRef.current || turnstileToken);
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
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos enviar tu postulación');
      window.sessionStorage.removeItem(storageKey);
      setSent(true);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError.message);
      window.turnstile?.reset(widgetRef.current);
      tokenRef.current = '';
      setTurnstileToken('');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section className="application-success" role="status">
        <span aria-hidden="true" className="material-symbols-outlined">check_circle</span>
        <h2>Recibimos tu postulación</h2>
        <p>Gracias por querer sumarte. El equipo va a revisar la información enviada.</p>
      </section>
    );
  }

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <script
          async
          defer
          onLoad={() => setTurnstileReady(true)}
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        />
      )}
      <form className="application-form" encType="multipart/form-data" onSubmit={submit} ref={formRef}>
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
            Teléfono <small>Opcional</small>
            <input autoComplete="tel" maxLength="40" name="phone" type="tel" />
          </label>
          <label>
            LinkedIn <small>Opcional</small>
            <input maxLength="500" name="linkedinUrl" placeholder="https://linkedin.com/in/..." type="url" />
          </label>
        </div>
        <label>
          Área de interés
          <select name="area" required>
            <option value="">Seleccioná un área</option>
            <option>Comunicación y contenidos</option>
            <option>Desarrollo institucional</option>
            <option>Investigación y análisis</option>
            <option>Proyectos y participación</option>
            <option>Tecnología y datos</option>
            <option>Otra</option>
          </select>
        </label>
        <label>
          Contanos por qué querés sumarte
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
          <span>Acepto que Fundación Politeia almacene y revise esta información.</span>
        </label>
        {TURNSTILE_SITE_KEY && (
          <div
            className="cf-turnstile"
            data-appearance="interaction-only"
            data-callback="onPoliteiaTurnstileSuccess"
            data-error-callback="onPoliteiaTurnstileError"
            data-execution="execute"
            data-expired-callback="onPoliteiaTurnstileExpired"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-size="flexible"
            ref={widgetRef}
          />
        )}
        {error && <div className="application-form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy || verifying} type="submit">
          {busy ? 'Enviando postulación...' : verifying ? 'Verificando...' : 'Enviar postulación'}
        </button>
      </form>
    </>
  );
}
