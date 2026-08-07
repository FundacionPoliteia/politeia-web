'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { publicApiBase } from '@/lib/api';

declare global { interface Window { turnstile?: { render: (element: HTMLElement, options: Record<string, unknown>) => string }; } }

export default function ShareFollow({ projectId, title, subscriptionsEnabled }: { projectId: string; title: string; subscriptionsEnabled: boolean }) {
  const [dialog, setDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
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

  return <><div className="action-stack"><button className="button dark" type="button" onClick={share}>{copied ? 'Enlace copiado' : 'Compartir ficha'}</button><a className="button ghost" href={`https://wa.me/?text=${encodeURIComponent(`${title} · ${url}`)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>{subscriptionsEnabled && <button className="button primary" type="button" onClick={() => { setDialog(true); metric('follow-opened'); }}>Seguir proyecto</button>}</div>{dialog && <FollowDialog projectId={projectId} title={title} onClose={() => setDialog(false)} />}</>;
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
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="follow-title" onMouseDown={(event) => event.stopPropagation()}><span className="eyebrow">Avisos por correo</span><h2 id="follow-title">Seguir {title}</h2><p>Recibirás avisos sólo cuando el equipo editorial marque una publicación como relevante.</p><form onSubmit={submit}><label className="field"><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="check-row"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Acepto el uso de mi email para este seguimiento según la <Link href="/privacidad">política de privacidad</Link>.</span></label>{siteKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onLoad={renderTurnstile} /><div id="quorum-turnstile" /></>}{message && <p className="message" role="status">{message}{debugToken && <> <Link href={`/seguir/confirmar?token=${encodeURIComponent(debugToken)}`}>Abrir confirmación local</Link>.</>}</p>}<div className="dialog-actions"><button className="button ghost" type="button" onClick={onClose}>Cerrar</button><button className="button primary" disabled={busy || (Boolean(siteKey) && !turnstileToken)}>{busy ? 'Guardando…' : 'Enviar confirmación'}</button></div></form></section></div>;
}

function metric(event: string) { void fetch(`${publicApiBase}/v1/public/metrics`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ event }) }).catch(() => undefined); }
