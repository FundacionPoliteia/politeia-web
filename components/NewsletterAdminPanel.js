'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [mailPreview, setMailPreview] = useState(null);
  const [previewViewport, setPreviewViewport] = useState('desktop');
  const [subscriberModal, setSubscriberModal] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateToLoad, setTemplateToLoad] = useState(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDeleteTarget, setTemplateDeleteTarget] = useState(null);
  const subscriberRequestRef = useRef(0);

  useEffect(() => {
    loadOverview();
    loadTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!subscriberModal && !mailPreview && !templateToLoad && !saveTemplateOpen && !templateDeleteTarget) return undefined;
    function closeOnEscape(event) {
      if (event.key !== 'Escape' || busyAction) return;
      if (subscriberModal) closeSubscriberModal();
      else if (mailPreview) setMailPreview(null);
      else if (templateToLoad) setTemplateToLoad(null);
      else if (saveTemplateOpen) setSaveTemplateOpen(false);
      else setTemplateDeleteTarget(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busyAction, mailPreview, saveTemplateOpen, subscriberModal, templateDeleteTarget, templateToLoad]);

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
        body: JSON.stringify({
          to: form.testEmail,
          subject: form.subject,
          previewText: form.previewText,
          content: form.content,
        }),
      });
      setMailPreview(null);
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
      if (send) setMailPreview(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const data = await mailApi('/v1/newsletter/admin/templates');
      const items = data.items || [];
      setTemplates(items);
      setSelectedTemplateId((current) => current || items[0]?.id || '');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function openMailPreview(intent = 'preview') {
    const action = `preview-${intent}`;
    setBusyAction(action);
    setMessage('');
    try {
      const data = await mailApi('/v1/newsletter/admin/preview', {
        method: 'POST',
        body: JSON.stringify({
          subject: form.subject,
          previewText: form.previewText,
          content: form.content,
        }),
      });
      setPreviewViewport('desktop');
      setMailPreview({ intent, html: data.html || '', text: data.text || '' });
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

  async function openSubscriberModal(status) {
    const requestId = subscriberRequestRef.current + 1;
    subscriberRequestRef.current = requestId;
    setSubscriberModal({ status, items: [], total: 0, loading: true, error: '' });
    try {
      const data = await mailApi(`/v1/newsletter/admin/subscribers?status=${encodeURIComponent(status)}&limit=50`);
      if (subscriberRequestRef.current !== requestId) return;
      setSubscriberModal({
        status,
        items: data.items || [],
        total: data.total || 0,
        loading: false,
        error: '',
      });
    } catch (err) {
      if (subscriberRequestRef.current !== requestId) return;
      setSubscriberModal({ status, items: [], total: 0, loading: false, error: err.message });
    }
  }

  function closeSubscriberModal() {
    subscriberRequestRef.current += 1;
    setSubscriberModal(null);
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

  function requestTemplateLoad() {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;
    if (hasCampaignContent(form)) {
      setTemplateToLoad(template);
      return;
    }
    applyTemplate(template);
  }

  function applyTemplate(template) {
    setForm((current) => ({
      ...current,
      name: template.campaignName || template.name || '',
      subject: template.subject || '',
      previewText: template.previewText || '',
      content: template.content || '',
    }));
    setTemplateToLoad(null);
    setMessage(`Plantilla "${template.name}" cargada.`);
  }

  function openSaveTemplate() {
    setTemplateName(form.name.trim() || form.subject.trim() || 'Nueva plantilla');
    setSaveTemplateOpen(true);
  }

  async function saveTemplate() {
    setBusyAction('template-save');
    setMessage('');
    try {
      const data = await mailApi('/v1/newsletter/admin/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: templateName,
          campaignName: form.name,
          subject: form.subject,
          previewText: form.previewText,
          content: form.content,
        }),
      });
      setTemplates((current) => [
        ...current.filter((item) => item.builtIn),
        data.item,
        ...current.filter((item) => !item.builtIn),
      ]);
      setSelectedTemplateId(data.item.id);
      setSaveTemplateOpen(false);
      setMessage(`Plantilla "${data.item.name}" guardada.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function deleteTemplate() {
    if (!templateDeleteTarget) return;
    setBusyAction('template-delete');
    setMessage('');
    try {
      await mailApi(`/v1/newsletter/admin/templates/${encodeURIComponent(templateDeleteTarget.id)}`, { method: 'DELETE' });
      setTemplates((current) => current.filter((item) => item.id !== templateDeleteTarget.id));
      setSelectedTemplateId((current) => (
        current === templateDeleteTarget.id ? templates.find((item) => item.builtIn)?.id || '' : current
      ));
      setMessage(`Plantilla "${templateDeleteTarget.name}" eliminada.`);
      setTemplateDeleteTarget(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyAction('');
    }
  }

  const campaignReady = Boolean(form.subject.trim() && form.content.trim());
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);

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
            <button aria-haspopup="dialog" aria-label="Ver suscriptores confirmados" onClick={() => openSubscriberModal('subscribed')} type="button">
              <strong>{overview.counts.subscribed}</strong><span>confirmados</span>
            </button>
            <button aria-haspopup="dialog" aria-label="Ver suscriptores pendientes" onClick={() => openSubscriberModal('pending')} type="button">
              <strong>{overview.counts.pending}</strong><span>pendientes</span>
            </button>
          </div>
        )}
      </div>

      {subscriberModal && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={closeSubscriberModal}>
          <div aria-labelledby="newsletter-subscribers-title" aria-modal="true" className="admin-modal admin-newsletter-subscribers" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <div className="admin-newsletter-subscribers-head">
              <div>
                <span>Suscriptores</span>
                <h2 id="newsletter-subscribers-title">
                  {subscriberModal.status === 'subscribed' ? 'Confirmados' : 'Pendientes'}
                </h2>
                {!subscriberModal.loading && !subscriberModal.error && (
                  <p>{subscriberModal.total} {subscriberModal.total === 1 ? 'persona' : 'personas'}</p>
                )}
              </div>
              <button aria-label="Cerrar lista" className="admin-icon-button admin-modal-close" onClick={closeSubscriberModal} type="button">
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
              </button>
            </div>
            {subscriberModal.loading ? (
              <div className="admin-newsletter-subscriber-state" role="status">
                <span className="admin-spinner" aria-hidden="true" />
                Cargando suscriptores...
              </div>
            ) : subscriberModal.error ? (
              <div className="admin-profile-notice" role="alert">{subscriberModal.error}</div>
            ) : subscriberModal.items.length === 0 ? (
              <div className="admin-newsletter-subscriber-state">No hay suscriptores en este estado.</div>
            ) : (
              <div className="admin-newsletter-subscriber-list">
                {subscriberModal.items.map((subscriber) => (
                  <article key={subscriber.id || subscriber.email}>
                    <strong>{subscriber.email}</strong>
                    <span>
                      {subscriber.source ? `Origen: ${subscriber.source}` : 'Origen no informado'}
                      {' - '}
                      {formatSubscriberDate(subscriber.confirmedAt || subscriber.requestedAt || subscriber.updatedAt)}
                    </span>
                  </article>
                ))}
              </div>
            )}
            {subscriberModal.total > subscriberModal.items.length && (
              <small className="admin-newsletter-subscriber-limit">Se muestran las 50 personas mas recientes.</small>
            )}
          </div>
        </div>
      )}

      <section className="admin-newsletter-template-library" aria-labelledby="newsletter-templates-title">
        <div className="admin-newsletter-template-head">
          <div>
            <span>Plantillas</span>
            <h3 id="newsletter-templates-title">Empezar desde una base</h3>
          </div>
          <button className="btn btn-ghost" disabled={!campaignReady || Boolean(busyAction)} onClick={openSaveTemplate} type="button">
            <span aria-hidden="true" className="material-symbols-outlined">bookmark_add</span>
            Guardar actual
          </button>
        </div>
        <div className="admin-newsletter-template-controls">
          <label>
            Plantilla
            <select disabled={templatesLoading || Boolean(busyAction)} onChange={(event) => setSelectedTemplateId(event.target.value)} value={selectedTemplateId}>
              {templatesLoading && <option value="">Cargando plantillas...</option>}
              {!templatesLoading && templates.length === 0 && <option value="">No hay plantillas disponibles</option>}
              {templates.some((item) => item.builtIn) && (
                <optgroup label="Plantillas base">
                  {templates.filter((item) => item.builtIn).map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </optgroup>
              )}
              {templates.some((item) => !item.builtIn) && (
                <optgroup label="Plantillas propias">
                  {templates.filter((item) => !item.builtIn).map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <button className="btn btn-primary" disabled={!selectedTemplate || Boolean(busyAction)} onClick={requestTemplateLoad} type="button">
            Usar plantilla
          </button>
          {selectedTemplate && !selectedTemplate.builtIn && (
            <button aria-label={`Eliminar plantilla ${selectedTemplate.name}`} className="admin-icon-button admin-newsletter-template-delete" disabled={Boolean(busyAction)} onClick={() => setTemplateDeleteTarget(selectedTemplate)} title="Eliminar plantilla" type="button">
              <span aria-hidden="true" className="material-symbols-outlined">delete</span>
            </button>
          )}
        </div>
        <small>Al cargar una plantilla se completan el nombre interno, asunto, texto de previsualizacion y contenido.</small>
      </section>

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
          <button className="btn btn-ghost" disabled={!campaignReady || !form.testEmail.trim() || busyAction} onClick={() => openMailPreview('test')} type="button">
            {busyAction === 'preview-test' ? 'Preparando vista...' : 'Enviar prueba'}
          </button>
        </div>
        {message && <div className="admin-profile-notice" role="status">{message}</div>}
        <div className="admin-manager-actions">
          <span>{overview?.provider === 'console' ? 'Modo local: los envios se registran en consola.' : 'El envio usa el Segment configurado en Resend.'}</span>
          <button className="btn btn-ghost" disabled={!campaignReady || busyAction} onClick={() => openMailPreview('preview')} type="button">
            {busyAction === 'preview-preview' ? 'Preparando vista...' : 'Previsualizar'}
          </button>
          <button className="btn btn-ghost" disabled={!campaignReady || busyAction} onClick={() => createCampaign(false)} type="button">
            {busyAction === 'draft' ? 'Creando borrador...' : 'Crear borrador'}
          </button>
          <button className="btn btn-primary" disabled={!campaignReady || busyAction} onClick={() => openMailPreview('send')} type="button">
            {busyAction === 'preview-send' ? 'Preparando vista...' : 'Enviar newsletter'}
          </button>
        </div>
      </div>

      {mailPreview && (
        <div className="admin-modal-backdrop admin-newsletter-preview-backdrop" role="presentation" onMouseDown={() => !busyAction && setMailPreview(null)}>
          <div aria-labelledby="newsletter-preview-title" aria-modal="true" className="admin-modal admin-newsletter-preview-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <header className="admin-newsletter-preview-head">
              <div>
                <span>Vista previa final</span>
                <h2 id="newsletter-preview-title">{form.subject}</h2>
                <p>{mailPreview.intent === 'test' ? `Prueba para ${form.testEmail}` : mailPreview.intent === 'send' ? 'Envio a la lista confirmada' : 'Revision del newsletter'}</p>
              </div>
              <button aria-label="Cerrar vista previa" className="admin-icon-button" disabled={Boolean(busyAction)} onClick={() => setMailPreview(null)} type="button">
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
              </button>
            </header>
            <div className="admin-newsletter-preview-toolbar" aria-label="Tamano de vista previa">
              <button aria-pressed={previewViewport === 'desktop'} className={previewViewport === 'desktop' ? 'selected' : ''} onClick={() => setPreviewViewport('desktop')} type="button">
                <span aria-hidden="true" className="material-symbols-outlined">desktop_windows</span>
                Desktop
              </button>
              <button aria-pressed={previewViewport === 'mobile'} className={previewViewport === 'mobile' ? 'selected' : ''} onClick={() => setPreviewViewport('mobile')} type="button">
                <span aria-hidden="true" className="material-symbols-outlined">smartphone</span>
                Mobile
              </button>
            </div>
            <div className={`admin-newsletter-preview-stage ${previewViewport}`}>
              <iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={mailPreview.html} title={`Vista previa de ${form.subject}`} />
            </div>
            <div className="admin-modal-actions admin-newsletter-preview-actions">
              <button className="btn btn-ghost" disabled={Boolean(busyAction)} onClick={() => setMailPreview(null)} type="button">
                {mailPreview.intent === 'preview' ? 'Cerrar' : 'Volver a editar'}
              </button>
              {mailPreview.intent === 'test' && (
                <button className="btn btn-primary" disabled={busyAction === 'test'} onClick={sendTest} type="button">
                  {busyAction === 'test' ? 'Enviando prueba...' : 'Confirmar prueba'}
                </button>
              )}
              {mailPreview.intent === 'send' && (
                <button className="btn btn-primary" disabled={busyAction === 'send'} onClick={() => createCampaign(true)} type="button">
                  {busyAction === 'send' ? 'Enviando...' : 'Confirmar envio'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {templateToLoad && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={() => setTemplateToLoad(null)}>
          <div aria-labelledby="newsletter-template-load-title" aria-modal="true" className="admin-modal admin-newsletter-confirm" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <span>Cargar plantilla</span>
            <h2 id="newsletter-template-load-title">Reemplazar el contenido actual</h2>
            <p>La plantilla "{templateToLoad.name}" reemplazara los datos que estas editando. Esta accion no guarda el borrador actual.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" onClick={() => setTemplateToLoad(null)} type="button">Cancelar</button>
              <button className="btn btn-primary" onClick={() => applyTemplate(templateToLoad)} type="button">Cargar plantilla</button>
            </div>
          </div>
        </div>
      )}

      {saveTemplateOpen && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={() => !busyAction && setSaveTemplateOpen(false)}>
          <div aria-labelledby="newsletter-template-save-title" aria-modal="true" className="admin-modal admin-newsletter-confirm" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <span>Nueva plantilla</span>
            <h2 id="newsletter-template-save-title">Guardar este contenido para reutilizar</h2>
            <label className="admin-newsletter-template-name">
              Nombre de la plantilla
              <input autoFocus maxLength="80" onChange={(event) => setTemplateName(event.target.value)} value={templateName} />
            </label>
            <p>Se guardaran el asunto, la previsualizacion y el contenido actual. Luego podras cargarlos desde esta biblioteca.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" disabled={busyAction === 'template-save'} onClick={() => setSaveTemplateOpen(false)} type="button">Cancelar</button>
              <button className="btn btn-primary" disabled={!templateName.trim() || busyAction === 'template-save'} onClick={saveTemplate} type="button">
                {busyAction === 'template-save' ? 'Guardando...' : 'Guardar plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {templateDeleteTarget && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={() => !busyAction && setTemplateDeleteTarget(null)}>
          <div aria-labelledby="newsletter-template-delete-title" aria-modal="true" className="admin-modal admin-newsletter-confirm" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <span>Eliminar plantilla</span>
            <h2 id="newsletter-template-delete-title">Eliminar "{templateDeleteTarget.name}"</h2>
            <p>La plantilla dejara de estar disponible para el equipo. Los newsletters que ya la usaron no se modificaran.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" disabled={busyAction === 'template-delete'} onClick={() => setTemplateDeleteTarget(null)} type="button">Cancelar</button>
              <button className="btn btn-danger" disabled={busyAction === 'template-delete'} onClick={deleteTemplate} type="button">
                {busyAction === 'template-delete' ? 'Eliminando...' : 'Eliminar plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function hasCampaignContent(form) {
  return Boolean(form.name.trim() || form.subject.trim() || form.previewText.trim() || form.content.trim());
}

function formatSubscriberDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
