'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useId, useRef, useState } from 'react';
import { publicApiBase } from '@/lib/api';

declare global { interface Window { turnstile?: { render: (element: HTMLElement, options: Record<string, unknown>) => string }; } }

export default function ShareFollow({ projectId, title, subscriptionsEnabled }: { projectId: string; title: string; subscriptionsEnabled: boolean }) {
  const [dialog, setDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setUrl(window.location.href), []);
  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  function showCopiedConfirmation() {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    setCopied(true);
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1500);
  }

  async function share() {
    const data = { title: `${title} · Quórum`, text: `Consultá el seguimiento de ${title} en Quórum Politeia.`, url: window.location.href };
    if (navigator.share) await navigator.share(data).catch(() => undefined);
    else { await navigator.clipboard.writeText(window.location.href); showCopiedConfirmation(); }
    metric('share-clicked');
  }

  return <><section className={`sidebar-card project-share-card${minimized ? ' is-minimized' : ''}${expanded ? ' is-expanded' : ''}`} aria-label="Compartir ficha" onKeyDown={(event) => { if (event.key === 'Escape' && expanded) { setExpanded(false); toggleRef.current?.focus(); } }}>
    <div className="project-share-message"><h3>Guardá o compartí esta ficha</h3><p>El enlace siempre apunta a la última versión publicada por el equipo de Quórum.</p></div>
    <div className="project-share-mobile-controls">
      <button ref={toggleRef} className="project-share-toggle" type="button" aria-label={expanded ? 'Cerrar opciones para compartir' : 'Abrir opciones para compartir'} aria-expanded={expanded} aria-controls={actionsId} onClick={() => { setMinimized(false); setExpanded(!expanded); }}><svg viewBox="0 0 24 24" aria-hidden="true">{expanded ? <path d="m6 9 6 6 6-6" /> : <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></>}</svg></button>
      {!minimized && <button className="project-share-minimize" type="button" aria-label="Minimizar aviso para compartir" onClick={() => { setMinimized(true); setExpanded(false); toggleRef.current?.focus(); }}><span aria-hidden="true">×</span></button>}
    </div>
    <div id={actionsId} className="action-stack project-share-actions"><button className="button dark" type="button" onClick={share}>{copied ? 'Enlace copiado' : 'Compartir ficha'}</button><a className="button ghost" href={`https://wa.me/?text=${encodeURIComponent(`${title} · ${url}`)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>{subscriptionsEnabled && <button className="button primary" type="button" onClick={() => { setDialog(true); metric('follow-opened'); }}>Seguir proyecto</button>}</div>
  </section>{dialog && <FollowDialog projectId={projectId} title={title} onClose={() => setDialog(false)} />}</>;
}

function FollowDialog({ projectId, title, onClose }: { projectId: string; title: string; onClose: () => void }) {
  const [email, setEmail] = useState(''); const [consent, setConsent] = useState(false); const [turnstileToken, setTurnstileToken] = useState(''); const [message, setMessage] = useState(''); const [debugToken, setDebugToken] = useState(''); const [busy, setBusy] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  function renderTurnstile() {
    if (!siteKey || !window.turnstile) return;
    const target = document.getElementById('quorum-turnstile');
    if (target && !target.hasChildNodes()) window.turnstile.render(target, { sitekey: siteKey, callback: (token: string) => setTurnstileToken(token), 'expired-callback': () => setTurnstileToken('') });
  }
  useEffect(renderTurnstile, [siteKey]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch(`${publicApiBase}/v1/public/follows/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email, projectId, consent, turnstileToken }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || 'No pudimos guardar la solicitud');
      setMessage(data.status === 'active' ? 'Ya seguís este proyecto.' : 'Te enviamos un correo para confirmar el seguimiento.');
      setDebugToken(data.debugToken || '');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos guardar la solicitud'); } finally { setBusy(false); }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="follow-title" onMouseDown={(event) => event.stopPropagation()}><span className="eyebrow">Avisos por correo</span><h2 id="follow-title">Seguir {title}</h2><p>Recibirás avisos sólo cuando el equipo editorial marque una publicación como relevante.</p><form onSubmit={submit}><label className="field"><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="check-row"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Acepto el uso de mi email para recibir actualizaciones sobre este proyecto.</span></label>{siteKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onLoad={renderTurnstile} /><div id="quorum-turnstile" /></>}{message && <p className="message" role="status">{message}{debugToken && <> <Link href={`/seguir/confirmar?token=${encodeURIComponent(debugToken)}`}>Abrir confirmación local</Link>.</>}</p>}<div className="dialog-actions"><button className="button ghost" type="button" onClick={onClose}>Cerrar</button><button className="button primary" disabled={busy || (Boolean(siteKey) && !turnstileToken)}>{busy ? 'Guardando…' : 'Enviar confirmación'}</button></div></form></section></div>;
}

function metric(event: string) { void fetch(`${publicApiBase}/v1/public/metrics`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ event }) }).catch(() => undefined); }
