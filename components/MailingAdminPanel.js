'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_SETTINGS = {
  enabled: false,
  automaticByDefault: true,
  weeklyLimit: 2,
  dispatchIntervalHours: 12,
  gracePeriodMinutes: 10,
  timeZone: 'America/Argentina/Buenos_Aires',
  singleSubject: 'Nueva nota en Politeia: {{title}}',
  digestSubject: '{{count}} nuevas notas para leer en Politeia',
  singlePreheader: 'Una nueva lectura ya esta disponible en el blog.',
  digestPreheader: 'Las nuevas notas publicadas por Politeia.',
  digestIntro: 'Mira las nuevas notas que publicamos.',
  ctaLabel: 'Leer la nota',
  maxFullCards: 6,
};

export default function MailingAdminPanel({ apiBase, currentEmail }) {
  const [overview, setOverview] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [testEmail, setTestEmail] = useState(currentEmail || '');
  const [preview, setPreview] = useState(null);

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => {
    if (!preview) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setPreview(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [preview]);

  const jobs = overview?.jobs || [];
  const allSelected = jobs.length > 0 && jobs.every((job) => selected.includes(job.id));
  const selectedJobs = useMemo(() => jobs.filter((job) => selected.includes(job.id)), [jobs, selected]);

  async function mailingApi(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || 'No pudimos completar la accion.');
    return data;
  }

  async function loadOverview({ silent = false } = {}) {
    if (!silent) setBusy('load');
    try {
      const data = await mailingApi('/v1/mailing/admin/overview');
      setOverview(data);
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
      setSelected((current) => current.filter((id) => data.jobs?.some((job) => job.id === id)));
    } catch (err) {
      setMessage(err.message);
    } finally {
      if (!silent) setBusy('');
    }
  }

  async function saveSettings() {
    setBusy('settings');
    setMessage('');
    try {
      const data = await mailingApi('/v1/mailing/admin/settings', { method: 'PATCH', body: JSON.stringify(settings) });
      setSettings({ ...DEFAULT_SETTINGS, ...(data.item || {}) });
      setMessage('Configuracion de mailing guardada.');
      await loadOverview({ silent: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy('');
    }
  }

  function resetSettings() {
    setSettings({ ...DEFAULT_SETTINGS });
    setMessage('Restauramos los valores predeterminados en el formulario. Revisa los cambios y guardalos para aplicarlos.');
  }

  async function runAction(action) {
    if (!selected.length || busy) return;
    const forced = action === 'send-now';
    if (forced && !window.confirm(`Se enviara un correo a todo el segmento con ${selected.length} ${selected.length === 1 ? 'nota' : 'notas'}. Puede superar el limite semanal. Continuar?`)) return;
    setBusy(`action:${action}`);
    setMessage('');
    try {
      await mailingApi('/v1/mailing/admin/jobs/actions', { method: 'POST', body: JSON.stringify({ jobIds: selected, action }) });
      setMessage(action === 'send-now' ? 'Envio excepcional procesado.' : 'Cola actualizada.');
      setSelected([]);
      await loadOverview({ silent: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy('');
    }
  }

  async function openPreview(mode = '') {
    setBusy('preview');
    setMessage('');
    try {
      const data = await mailingApi('/v1/mailing/admin/preview', {
        method: 'POST',
        body: JSON.stringify({ jobIds: selected, mode: mode || (selected.length > 1 ? 'stack' : 'single') }),
      });
      setPreview(data);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy('');
    }
  }

  async function sendTest(mode = '') {
    if (!testEmail.trim()) return;
    setBusy('test');
    setMessage('');
    try {
      await mailingApi('/v1/mailing/admin/test', {
        method: 'POST',
        body: JSON.stringify({ to: testEmail, jobIds: selected, mode: mode || (selected.length > 1 ? 'stack' : 'single') }),
      });
      setMessage(`Prueba enviada a ${testEmail}. No consumio cupos.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="admin-manager admin-mailing-manager">
      <div className="admin-manager-head">
        <div>
          <span>Mailing</span>
          <h2>Avisos automaticos del blog</h2>
          <p>Controla la frecuencia, la cola y los envios agrupados sin mezclar el newsletter editorial.</p>
        </div>
        <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => loadOverview()} type="button">Actualizar</button>
      </div>

      {message && <div className="admin-profile-notice" role="status">{message}</div>}

      <div className="admin-mailing-metrics" aria-label="Estado semanal">
        <article><strong>{overview?.sentThisWeek || 0}/{settings.weeklyLimit}</strong><span>envios esta semana</span></article>
        <article><strong>{overview?.remainingThisWeek || 0}</strong><span>cupos disponibles</span></article>
        <article><strong>{overview?.queuedCount || 0}</strong><span>notas en cola</span></article>
        <article><strong>{overview?.recipientCount || 0}</strong><span>suscriptores de nuevas notas</span></article>
      </div>
      <p className="admin-mailing-schedule">
        <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
        El dispatcher procesa la cola cada {settings.dispatchIntervalHours} horas. Proximo ciclo estimado: {formatDate(overview?.nextDispatchAt)}.
      </p>

      <details className="admin-mailing-settings" open>
        <summary>
          <span>Configuracion automatica</span>
          <small>Reglas de envio y textos reutilizables</small>
        </summary>
        <div className="admin-mailing-settings-content">
          <section className="admin-mailing-settings-group">
            <header>
              <span className="material-symbols-outlined" aria-hidden="true">tune</span>
              <div><h3>Comportamiento</h3><p>Decidi cuando el sistema puede incorporar nuevas publicaciones a la cola.</p></div>
            </header>
            <div className="admin-mailing-toggle-grid">
              <label className="admin-mailing-toggle-card">
                <input checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
                <span className="admin-mailing-toggle-copy">
                  <strong>Automatizacion activa <SettingHelp text="Es el interruptor maestro. Cuando esta apagado no se procesan ciclos automaticos ni se envian avisos pendientes. No elimina suscriptores, historial ni configuracion, y las pruebas o envios manuales siguen disponibles." /></strong>
                  <small>Procesa automaticamente las publicaciones elegibles.</small>
                </span>
              </label>
              <label className="admin-mailing-toggle-card">
                <input checked={settings.automaticByDefault} onChange={(event) => setSettings((current) => ({ ...current, automaticByDefault: event.target.checked }))} type="checkbox" />
                <span className="admin-mailing-toggle-copy">
                  <strong>Avisar al publicar <SettingHelp text="Define el valor inicial del aviso dentro del modal de publicacion. Activarlo no envia el correo inmediatamente: cada nota puede excluirse antes de publicar y, si se incluye, respetara la espera, el ciclo y el limite semanal." /></strong>
                  <small>Preselecciona el aviso para cada nueva nota.</small>
                </span>
              </label>
            </div>
          </section>

          <section className="admin-mailing-settings-group">
            <header>
              <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
              <div><h3>Ritmo y limites</h3><p>Controla la frecuencia para evitar envios excesivos y dar margen de correccion.</p></div>
            </header>
            <div className="admin-mailing-settings-grid admin-mailing-timing-grid">
              <MailingSettingField label="Limite semanal" help="Cantidad maxima de campanas automaticas que se pueden enviar durante una semana calculada en la zona horaria configurada. Al alcanzar el limite, las notas siguientes se conservan y se agrupan para un resumen posterior. El valor 0 pausa los envios automaticos; un envio manual forzado puede superar este limite.">
                <input min="0" max="7" type="number" value={settings.weeklyLimit} onChange={(event) => setSettings((current) => ({ ...current, weeklyLimit: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField label="Frecuencia del ciclo" suffix="horas" help="Intervalo minimo entre dos ciclos automaticos. El proceso externo puede consultar antes, pero el backend no vuelve a despachar hasta que transcurra esta cantidad de horas. Acepta valores entre 1 hora y 7 dias.">
                <input min="1" max="168" type="number" value={settings.dispatchIntervalHours} onChange={(event) => setSettings((current) => ({ ...current, dispatchIntervalHours: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField label="Espera despues de publicar" suffix="minutos" help="Tiempo durante el cual una nota publicada queda retenida antes de poder enviarse. Sirve para corregir titulo, portada o extracto, o para excluirla de la cola. Con 0 queda disponible para el proximo ciclo inmediatamente.">
                <input min="0" max="1440" type="number" value={settings.gracePeriodMinutes} onChange={(event) => setSettings((current) => ({ ...current, gracePeriodMinutes: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField label="Cards completas" suffix="por resumen" help="Cantidad maxima de notas que se muestran como cards completas dentro de un correo apilado. Si existen mas notas, las restantes se presentan de forma compacta para mantener el email legible y liviano.">
                <input min="1" max="12" type="number" value={settings.maxFullCards} onChange={(event) => setSettings((current) => ({ ...current, maxFullCards: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField className="admin-mailing-time-zone" label="Zona horaria" help="Se usa para determinar el inicio y cierre de cada semana, calcular el cupo disponible y mostrar el proximo ciclo. No cambia la zona horaria del lector ni la fecha publicada dentro de una nota.">
                <input list="mailing-time-zones" value={settings.timeZone} onChange={(event) => setSettings((current) => ({ ...current, timeZone: event.target.value }))} />
                <datalist id="mailing-time-zones"><option value="America/Argentina/Buenos_Aires" /><option value="America/Montevideo" /><option value="America/Santiago" /><option value="Europe/Madrid" /><option value="UTC" /></datalist>
              </MailingSettingField>
            </div>
          </section>

          <section className="admin-mailing-settings-group">
            <header>
              <span className="material-symbols-outlined" aria-hidden="true">mail</span>
              <div><h3>Correo de una sola nota</h3><p>Textos usados cuando el ciclo envia una publicacion individual.</p></div>
            </header>
            <div className="admin-mailing-settings-grid">
              <MailingSettingField className="admin-mailing-wide" label="Asunto individual" help="Asunto visible en la bandeja de entrada cuando se envia una sola nota. La variable {{title}} se reemplaza automaticamente por el titulo publicado; si la quitas, todos los correos individuales tendran un asunto fijo.">
                <input value={settings.singleSubject} onChange={(event) => setSettings((current) => ({ ...current, singleSubject: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField className="admin-mailing-wide" label="Texto de previsualizacion individual" help="Resumen corto que algunos clientes de correo muestran al lado o debajo del asunto antes de abrir el mensaje. No es un parrafo visible del cuerpo y se limita a 180 caracteres.">
                <input maxLength="180" value={settings.singlePreheader} onChange={(event) => setSettings((current) => ({ ...current, singlePreheader: event.target.value }))} />
              </MailingSettingField>
            </div>
          </section>

          <section className="admin-mailing-settings-group">
            <header>
              <span className="material-symbols-outlined" aria-hidden="true">view_agenda</span>
              <div><h3>Resumen de varias notas</h3><p>Textos usados cuando varias publicaciones se agrupan en un unico correo.</p></div>
            </header>
            <div className="admin-mailing-settings-grid">
              <MailingSettingField className="admin-mailing-wide" label="Asunto apilado" help="Asunto para un resumen con varias publicaciones. La variable {{count}} se reemplaza por la cantidad real de notas incluidas en el envio.">
                <input value={settings.digestSubject} onChange={(event) => setSettings((current) => ({ ...current, digestSubject: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField className="admin-mailing-wide" label="Texto de previsualizacion apilado" help="Texto breve que acompana al asunto en la bandeja de entrada cuando el correo contiene varias notas. Ayuda a anticipar el contenido sin repetir literalmente el asunto.">
                <input maxLength="180" value={settings.digestPreheader} onChange={(event) => setSettings((current) => ({ ...current, digestPreheader: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField className="admin-mailing-wide" label="Introduccion del resumen" help="Frase visible al comienzo del cuerpo del correo, antes de las cards de las notas. Conviene que sea breve y funcione con cualquier combinacion de publicaciones.">
                <input value={settings.digestIntro} onChange={(event) => setSettings((current) => ({ ...current, digestIntro: event.target.value }))} />
              </MailingSettingField>
              <MailingSettingField label="Texto del boton" help="Etiqueta de la llamada a la accion que abre cada nota en el blog. Se reutiliza tanto en correos individuales como en resumenes; debe ser corta y describir claramente el destino.">
                <input value={settings.ctaLabel} onChange={(event) => setSettings((current) => ({ ...current, ctaLabel: event.target.value }))} />
              </MailingSettingField>
            </div>
          </section>
        </div>
        <div className="admin-mailing-settings-actions">
          <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={resetSettings} type="button">
            <span aria-hidden="true" className="material-symbols-outlined">restart_alt</span>
            Restaurar valores predeterminados
          </button>
          <button className="btn btn-primary" disabled={Boolean(busy)} onClick={saveSettings} type="button">{busy === 'settings' ? 'Guardando...' : 'Guardar configuracion'}</button>
        </div>
      </details>

      <section className="admin-mailing-lab">
        <div><span>Laboratorio</span><h3>Previsualizacion y pruebas</h3><p>Las pruebas no consumen cupos ni cambian el estado de la cola.</p></div>
        <label>Enviar prueba a<input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></label>
        <div className="admin-row-actions">
          <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => openPreview(selected.length ? '' : 'single')} type="button">Previsualizar</button>
          <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => openPreview('stack')} type="button">Simular apilamiento</button>
          <button className="btn btn-primary" disabled={Boolean(busy) || !testEmail.trim()} onClick={() => sendTest(selected.length ? '' : 'stack')} type="button">{busy === 'test' ? 'Enviando...' : 'Enviar prueba'}</button>
        </div>
      </section>

      <section className="admin-mailing-queue">
        <div className="admin-mailing-queue-head"><div><span>Cola inteligente</span><h3>Notas y estado de envio</h3></div><small>{selectedJobs.length} seleccionadas</small></div>
        <div className="admin-mailing-batch-actions">
          <button className="btn btn-ghost" disabled={!selected.length || Boolean(busy)} onClick={() => runAction('queue')} type="button">Incluir</button>
          <button className="btn btn-ghost" disabled={!selected.length || Boolean(busy)} onClick={() => runAction('exclude')} type="button">Excluir</button>
          <button className="btn btn-ghost" disabled={!selected.length || Boolean(busy)} onClick={() => runAction('retry')} type="button">Reintentar</button>
          <button className="btn btn-primary" disabled={!selected.length || Boolean(busy)} onClick={() => runAction('send-now')} type="button">Enviar seleccion ahora</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-mailing-table">
            <thead><tr><th><input aria-label="Seleccionar todas" checked={allSelected} onChange={() => setSelected(allSelected ? [] : jobs.map((job) => job.id))} type="checkbox" /></th><th>Nota</th><th>Estado</th><th>Publicada</th><th>Envio</th><th>Detalle</th></tr></thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td><input aria-label={`Seleccionar ${job.postTitle}`} checked={selected.includes(job.id)} onChange={() => setSelected((current) => current.includes(job.id) ? current.filter((id) => id !== job.id) : [...current, job.id])} type="checkbox" /></td>
                  <td><strong>{job.postTitle || 'Nota sin titulo'}</strong><small>{job.postSlug || job.postId}</small></td>
                  <td><span className={`admin-status status-${mailingStatusTone(job.status)}`}>{mailingStatusLabel(job.status)}</span></td>
                  <td>{formatDate(job.publishedAt)}</td>
                  <td>{job.sentAt ? formatDate(job.sentAt) : job.digestWeekId ? `Resumen ${job.digestWeekId}` : 'Pendiente'}</td>
                  <td>{job.lastError || job.excludedReason || (job.providerCampaignId ? `Resend: ${job.providerCampaignId}` : '')}</td>
                </tr>
              ))}
              {!jobs.length && <tr><td colSpan="6">Todavia no hay publicaciones registradas en el sistema de mailing.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {preview && (
        <div className="admin-modal-backdrop admin-newsletter-preview-backdrop" onMouseDown={() => setPreview(null)} role="presentation">
          <div aria-modal="true" className="admin-modal admin-newsletter-preview-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <header className="admin-newsletter-preview-head"><div><span>Vista previa</span><h2>{preview.subject}</h2><p>{preview.previewText}</p></div><button aria-label="Cerrar" className="admin-icon-button" onClick={() => setPreview(null)} type="button"><span className="material-symbols-outlined">close</span></button></header>
            <div className="admin-newsletter-preview-stage"><iframe srcDoc={preview.html} title="Vista previa del mailing" /></div>
            <div className="admin-modal-actions admin-newsletter-preview-actions"><button className="btn btn-primary" onClick={() => setPreview(null)} type="button">Cerrar</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function mailingStatusLabel(status) {
  return ({ queued: 'En cola', digest_pending: 'Apilado', sent: 'Enviado', excluded: 'Excluido', failed: 'Error', canceled: 'Cancelado' })[status] || status || 'Pendiente';
}

function MailingSettingField({ children, className = '', help, label, suffix = '' }) {
  return (
    <label className={`admin-mailing-setting-field ${className}`.trim()}>
      <span className="admin-mailing-setting-label">
        <span>{label}</span>
        {suffix && <small>{suffix}</small>}
        <SettingHelp text={help} />
      </span>
      {children}
    </label>
  );
}

function SettingHelp({ text }) {
  function keepHelpFromChangingField(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <span
      aria-label={`Ayuda: ${text}`}
      className="admin-setting-help"
      onClick={keepHelpFromChangingField}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') keepHelpFromChangingField(event);
      }}
      role="button"
      tabIndex="0"
    >
      <span aria-hidden="true" className="material-symbols-outlined">help</span>
      <span className="admin-setting-tooltip" role="tooltip">{text}</span>
    </span>
  );
}

function mailingStatusTone(status) {
  if (status === 'sent') return 'published';
  if (status === 'failed' || status === 'canceled') return 'archived';
  if (status === 'excluded') return 'draft';
  return 'review';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
