'use client';

import { useEffect, useMemo, useState } from 'react';

const STATUSES = [
  { value: '', label: 'Todas' },
  { value: 'new', label: 'Nuevas' },
  { value: 'reviewing', label: 'En revision' },
  { value: 'contacted', label: 'Contactadas' },
  { value: 'archived', label: 'Archivadas' },
];

export default function ApplicationsAdminPanel({ apiBase }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [cvPreview, setCvPreview] = useState(null);

  useEffect(() => () => {
    if (cvPreview?.url) URL.revokeObjectURL(cvPreview.url);
  }, [cvPreview]);

  useEffect(() => {
    load({ reset: true });
  }, [status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applicationId = new URLSearchParams(window.location.search).get('application');
    if (applicationId) openApplication(applicationId);
  }, []);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => [item.fullName, item.email, item.area]
      .some((value) => String(value || '').toLowerCase().includes(term)));
  }, [items, search]);

  async function load({ reset = false } = {}) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (status) params.set('status', status);
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const response = await fetch(`${apiBase}/v1/applications/manage?${params}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos cargar las postulaciones');
      setItems((current) => reset ? data.items || [] : [...current, ...(data.items || [])]);
      setNextCursor(data.nextCursor || '');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateSelected(patch) {
    if (!selected) return;
    const key = `update:${selected.id}`;
    setBusy(key);
    setError('');
    try {
      const response = await fetch(`${apiBase}/v1/applications/manage/${selected.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos guardar la postulacion');
      setSelected(data.item);
      setItems((current) => current.map((item) => item.id === data.item.id ? data.item : item));
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusy('');
    }
  }

  async function openApplication(id) {
    setBusy(`detail:${id}`);
    setError('');
    try {
      const response = await fetch(`${apiBase}/v1/applications/manage/${id}`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos abrir la postulacion');
      setSelected(data.item);
    } catch (detailError) {
      setError(detailError.message);
    } finally {
      setBusy('');
    }
  }

  async function retryNotification() {
    if (!selected) return;
    setBusy(`notify:${selected.id}`);
    setError('');
    try {
      const response = await fetch(`${apiBase}/v1/applications/manage/${selected.id}/resend-notification`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'No pudimos reenviar el aviso');
      setSelected(data.item);
      setItems((current) => current.map((item) => item.id === data.item.id ? data.item : item));
    } catch (retryError) {
      setError(retryError.message);
    } finally {
      setBusy('');
    }
  }

  async function removeSelected() {
    if (!selected || !window.confirm('Eliminar definitivamente la postulacion y su CV? Esta accion no se puede deshacer.')) return;
    setBusy(`delete:${selected.id}`);
    try {
      const response = await fetch(`${apiBase}/v1/applications/manage/${selected.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'No pudimos eliminar la postulacion');
      }
      setItems((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy('');
    }
  }

  async function fetchCv({ preview = false } = {}) {
    if (!selected) return;
    setBusy(`${preview ? 'preview' : 'download'}:${selected.id}`);
    setError('');
    try {
      const response = await fetch(`${apiBase}/v1/applications/manage/${selected.id}/cv`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'No pudimos abrir el CV');
      }
      const blob = await response.blob();
      const fileName = selected.cv?.originalName || `cv-${selected.fullName || selected.id}`;
      const url = URL.createObjectURL(blob);
      if (preview && blob.type === 'application/pdf') {
        setCvPreview({ url, fileName });
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cvError) {
      setError(cvError.message);
    } finally {
      setBusy('');
    }
  }

  function closeDetail() {
    setCvPreview(null);
    setSelected(null);
  }

  return (
    <section className="admin-manager applications-admin">
      <div className="admin-manager-head">
        <div>
          <span>Equipo</span>
          <h2>Postulaciones</h2>
          <p>Revisa perfiles recibidos, descarga el CV privado y registra el avance de cada contacto.</p>
        </div>
        <button className="btn btn-ghost" disabled={loading} onClick={() => load({ reset: true })} type="button">
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div className="applications-toolbar">
        <div className="admin-filter-tags" aria-label="Filtrar postulaciones">
          {STATUSES.map((option) => (
            <button
              className={status === option.value ? 'active' : ''}
              key={option.value}
              onClick={() => setStatus(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          aria-label="Buscar en esta pagina"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, email o area"
          type="search"
          value={search}
        />
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      {!loading && !visibleItems.length && <p className="admin-empty-state">No hay postulaciones en esta vista.</p>}

      <div className="applications-list">
        {visibleItems.map((item) => (
          <button
            aria-busy={busy === `detail:${item.id}`}
            className="application-row"
            disabled={busy === `detail:${item.id}`}
            key={item.id}
            onClick={() => openApplication(item.id)}
            type="button"
          >
            <span className="application-row-person">
              <strong>{item.fullName}</strong>
              <small>{item.email}</small>
            </span>
            <span className="application-row-summary">
              <strong>{item.area}</strong>
              <small>{truncate(item.message, 90) || 'Sin presentación'}</small>
            </span>
            <span className="application-row-file">
              <strong>{formatDate(item.createdAt)}</strong>
              <small>{item.cv?.originalName || 'CV adjunto'}</small>
            </span>
            <span className="application-row-state">
              <span className={`application-status status-${item.status}`}>{statusLabel(item.status)}</span>
              <span aria-hidden="true" className="material-symbols-outlined">
                {busy === `detail:${item.id}` ? 'progress_activity' : 'chevron_right'}
              </span>
            </span>
          </button>
        ))}
      </div>

      {nextCursor && (
        <button className="btn btn-ghost applications-more" disabled={loading} onClick={() => load()} type="button">
          Cargar 30 mas
        </button>
      )}

      {selected && (
        <div className="admin-modal-backdrop" onMouseDown={() => !busy && closeDetail()} role="presentation">
          <section aria-modal="true" className="admin-modal application-detail-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Cerrar" className="application-close" onClick={closeDetail} type="button">
              <span aria-hidden="true" className="material-symbols-outlined">close</span>
            </button>
            <span className="application-detail-eyebrow">Postulación</span>
            <h2>{selected.fullName}</h2>
            <dl className="application-detail-data">
              <div>
                <dt>Email</dt>
                <dd><ContactLink href={`mailto:${selected.email}`} icon="mail">{selected.email}</ContactLink></dd>
              </div>
              <div><dt>Área</dt><dd>{selected.area}</dd></div>
              {selected.phone && (
                <div>
                  <dt>Teléfono</dt>
                  <dd><ContactLink href={`tel:${selected.phone}`} icon="call">{selected.phone}</ContactLink></dd>
                </div>
              )}
              {selected.linkedinUrl && (
                <div>
                  <dt>LinkedIn</dt>
                  <dd><ContactLink external href={selected.linkedinUrl} icon="open_in_new">Ver perfil</ContactLink></dd>
                </div>
              )}
            </dl>
            <div className="application-message">
              <strong>Presentación</strong>
              <p>{selected.message}</p>
            </div>
            <div className="application-cv-summary">
              <span aria-hidden="true" className="material-symbols-outlined">description</span>
              <span>
                <strong>{selected.cv?.originalName || 'Currículum adjunto'}</strong>
                <small>{formatFileMeta(selected.cv)}</small>
              </span>
            </div>
            {cvPreview && (
              <section className="application-cv-preview">
                <div>
                  <strong>Vista previa del CV</strong>
                  <button aria-label="Cerrar vista previa" onClick={() => setCvPreview(null)} type="button">
                    <span aria-hidden="true" className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <iframe src={cvPreview.url} title={`CV de ${selected.fullName}`} />
              </section>
            )}
            <label>
              Estado
              <select disabled={Boolean(busy)} onChange={(event) => updateSelected({ status: event.target.value })} value={selected.status}>
                {STATUSES.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Nota interna
              <textarea
                defaultValue={selected.internalNote || ''}
                key={selected.id}
                onBlur={(event) => {
                  if (event.target.value !== (selected.internalNote || '')) updateSelected({ internalNote: event.target.value });
                }}
                placeholder="Seguimiento visible solo para administradores"
                rows="4"
              />
            </label>
            <div className="admin-modal-actions application-actions">
              {selected.cv?.contentType === 'application/pdf' && (
                <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => fetchCv({ preview: true })} type="button">
                  <span aria-hidden="true" className="material-symbols-outlined">visibility</span>
                  {busy.startsWith('preview:') ? 'Abriendo...' : 'Ver CV'}
                </button>
              )}
              <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => fetchCv()} type="button">
                <span aria-hidden="true" className="material-symbols-outlined">download</span>
                {busy.startsWith('download:') ? 'Descargando...' : 'Descargar CV'}
              </button>
              {selected.notificationStatus === 'failed' && (
                <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={retryNotification} type="button">
                  {busy.startsWith('notify:') ? 'Reintentando...' : 'Reintentar aviso'}
                </button>
              )}
              <button className="btn btn-ghost danger" disabled={Boolean(busy)} onClick={removeSelected} type="button">
                {busy.startsWith('delete:') ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value));
}

function statusLabel(value) {
  return STATUSES.find((option) => option.value === value)?.label || value;
}

function ContactLink({ children, external = false, href, icon }) {
  return (
    <a
      className="application-contact-link"
      href={href}
      {...(external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}
    >
      <span aria-hidden="true" className="material-symbols-outlined">{icon}</span>
      {children}
    </a>
  );
}

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

function formatFileMeta(cv) {
  if (!cv) return 'Archivo privado';
  const type = cv.contentType === 'application/pdf' ? 'PDF' : 'DOCX';
  const size = cv.size ? `${(cv.size / (1024 * 1024)).toFixed(1)} MB` : '';
  return [type, size].filter(Boolean).join(' · ');
}
