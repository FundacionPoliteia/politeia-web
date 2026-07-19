'use client';

import { useEffect, useState } from 'react';
import RichTextEditor from './RichTextEditor';

const EMPTY_CAMPAIGN = {
  name: '',
  subject: '',
  previewText: '',
  content: '',
  testEmail: '',
};

export default function NewsletterAdminPanel({ apiBase, currentEmail }) {
  const [overview, setOverview] = useState(null);
  const [form, setForm] = useState(() => ({ ...EMPTY_CAMPAIGN, testEmail: currentEmail || '' }));
  const [busyAction, setBusyAction] = useState('');
  const [message, setMessage] = useState('');
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  useEffect(() => {
    loadOverview();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOverview() {
    try {
      const data = await mailApi('/v1/newsletter/admin/overview');
      setOverview(data);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function sendTest() {
    setBusyAction('test');
    setMessage('');
    try {
      await mailApi('/v1/newsletter/admin/test', {
        method: 'POST',
        body: JSON.stringify({ to: form.testEmail, subject: form.subject, content: form.content }),
      });
      setMessage('Prueba procesada. En modo console, revisa la terminal del backend.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function createCampaign(send) {
    setBusyAction(send ? 'send' : 'draft');
    setMessage('');
    try {
      const data = await mailApi('/v1/newsletter/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          subject: form.subject,
          previewText: form.previewText,
          content: form.content,
          send,
        }),
      });
      setMessage(send
        ? 'Newsletter entregado al proveedor para su envio.'
        : `Borrador creado${data.item?.providerCampaignId ? `: ${data.item.providerCampaignId}` : '.'}`);
      setConfirmSendOpen(false);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function uploadNewsletterImage(file) {
    if (!file) return '';
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${apiBase}/v1/media`, {
        method: 'POST',
        body,
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos subir la imagen. Intenta nuevamente.');
      setMessage('Imagen cargada.');
      return data.item?.url || '';
    } catch (err) {
      setMessage(err.message);
      return '';
    }
  }

  async function mailApi(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || 'No pudimos completar la operacion.');
    return data;
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const campaignReady = Boolean(form.subject.trim() && form.content.trim());

  return (
    <section className="admin-manager admin-newsletter-manager">
      <div className="admin-manager-head">
        <div>
          <span>Newsletter</span>
          <h2>Campanas y suscriptores</h2>
          <p>Crea una prueba o un borrador antes de enviar novedades a la lista confirmada.</p>
        </div>
        {overview && (
          <div className="admin-newsletter-counts" aria-label="Estado de suscripciones">
            <strong>{overview.counts.subscribed}</strong><small>confirmados</small>
            <strong>{overview.counts.pending}</strong><small>pendientes</small>
          </div>
        )}
      </div>

      <div className="admin-newsletter-form">
        <div className="admin-two">
          <label>
            Nombre interno
            <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Edicion semanal" />
          </label>
          <label>
            Asunto
            <input value={form.subject} onChange={(event) => update('subject', event.target.value)} placeholder="Novedades de Politeia" />
          </label>
        </div>
        <label>
          Texto de previsualizacion
          <input maxLength="180" value={form.previewText} onChange={(event) => update('previewText', event.target.value)} placeholder="La linea que acompana al asunto en la bandeja" />
        </label>
        <div className="admin-newsletter-editor">
          <span>Contenido</span>
          <RichTextEditor
            onChange={(content) => update('content', content)}
            onUploadImage={uploadNewsletterImage}
            placeholder="Escribi el contenido del newsletter..."
            showCommentTools={false}
            value={form.content}
          />
        </div>
        <div className="admin-newsletter-test-row">
          <label>
            Enviar prueba a
            <input type="email" value={form.testEmail} onChange={(event) => update('testEmail', event.target.value)} />
          </label>
          <button className="btn btn-ghost" disabled={!campaignReady || !form.testEmail.trim() || busyAction} onClick={sendTest} type="button">
            {busyAction === 'test' ? 'Enviando prueba...' : 'Enviar prueba'}
          </button>
        </div>
        {message && <div className="admin-profile-notice" role="status">{message}</div>}
        <div className="admin-manager-actions">
          <span>{overview?.provider === 'console' ? 'Modo local: los envios se registran en consola.' : 'El envio usa el Segment configurado en Resend.'}</span>
          <button className="btn btn-ghost" disabled={!campaignReady || busyAction} onClick={() => createCampaign(false)} type="button">
            {busyAction === 'draft' ? 'Creando borrador...' : 'Crear borrador'}
          </button>
          <button className="btn btn-primary" disabled={!campaignReady || busyAction} onClick={() => setConfirmSendOpen(true)} type="button">
            Enviar newsletter
          </button>
        </div>
      </div>

      {confirmSendOpen && (
        <div className="admin-modal-overlay" role="presentation" onMouseDown={() => setConfirmSendOpen(false)}>
          <div aria-labelledby="newsletter-confirm-title" aria-modal="true" className="admin-modal admin-newsletter-confirm" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <span>Confirmar envio</span>
            <h2 id="newsletter-confirm-title">Enviar a toda la lista confirmada</h2>
            <p>Se enviara "{form.subject}" mediante Resend. Esta accion no se puede deshacer desde el panel.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmSendOpen(false)} type="button">Cancelar</button>
              <button className="btn btn-primary" disabled={busyAction === 'send'} onClick={() => createCampaign(true)} type="button">
                {busyAction === 'send' ? 'Enviando...' : 'Confirmar envio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
