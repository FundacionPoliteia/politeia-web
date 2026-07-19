'use client';

import { useEffect, useMemo, useState } from 'react';

const METHOD_OPTIONS = ['', 'GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'success', label: 'Exitosos' },
  { value: 'redirect', label: 'Redirecciones' },
  { value: 'client-error', label: 'Errores 4xx' },
  { value: 'server-error', label: 'Errores 5xx' },
];

export default function AdminOperationsPanel({ apiBase, currentEmail }) {
  const [view, setView] = useState('requests');
  const [requestLogs, setRequestLogs] = useState([]);
  const [mailLogs, setMailLogs] = useState([]);
  const [retentionDays, setRetentionDays] = useState(14);
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [testConfirmOpen, setTestConfirmOpen] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    loadLogs({ silent: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const intervalId = window.setInterval(() => loadLogs({ silent: true }), 30000);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!testConfirmOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !testBusy) setTestConfirmOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [testBusy, testConfirmOpen]);

  const visibleRequestLogs = useMemo(() => requestLogs.filter((item) => {
    if (method && item.method !== method) return false;
    if (status && !matchesRequestStatus(item.status, status)) return false;
    return matchesText(item, query, [
      'method', 'path', 'area', 'status', 'requestId', 'actorEmail', 'originHost', 'errorMessage',
    ]);
  }), [method, query, requestLogs, status]);

  const visibleMailLogs = useMemo(() => mailLogs.filter((item) => {
    if (status && !matchesMailStatus(item.status, status)) return false;
    return matchesText(item, query, [
      'channel', 'type', 'recipientEmail', 'subject', 'status', 'provider', 'lastError', 'providerMessageId', 'providerStatus',
    ]);
  }), [mailLogs, query, status]);

  async function loadLogs({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [requests, mail] = await Promise.all([
        operationsApi('/v1/admin/logs/requests?limit=500'),
        operationsApi('/v1/admin/logs/mail?limit=500'),
      ]);
      setRequestLogs(requests.items || []);
      setMailLogs(mail.items || []);
      setRetentionDays(requests.retentionDays || 14);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function sendResendTest() {
    setTestBusy(true);
    setTestMessage('');
    try {
      const data = await operationsApi('/v1/admin/logs/resend-test', { method: 'POST' });
      setTestMessage(`Prueba aceptada por ${data.item?.provider || 'el proveedor'} con estado ${data.item?.status || 'enviado'}.`);
      setTestConfirmOpen(false);
      setView('mail');
      await loadLogs({ silent: true });
    } catch (err) {
      setTestMessage(err.message);
      setTestConfirmOpen(false);
    } finally {
      setTestBusy(false);
    }
  }

  function changeView(nextView) {
    setView(nextView);
    setMethod('');
    setStatus('');
  }

  async function operationsApi(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerError = data.error?.details?.providerError;
      throw new Error(providerError ? `${data.error?.message}: ${providerError}` : data.error?.message || 'No pudimos consultar los logs');
    }
    return data;
  }

  const visibleItems = view === 'requests' ? visibleRequestLogs : visibleMailLogs;

  return (
    <section className="admin-manager admin-operations-panel">
      <div className="admin-manager-head admin-operations-head">
        <div>
          <span>Administracion</span>
          <h2>Logs y diagnostico</h2>
          <p>Revisa llamadas a la API y el ciclo de entrega de correos sin exponer credenciales ni contenido privado.</p>
        </div>
        <div className="admin-operations-head-actions">
          <label className="admin-operations-auto-refresh">
            <input checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} type="checkbox" />
            Actualizar cada 30 s
          </label>
          <button className="btn btn-ghost" disabled={loading} onClick={() => loadLogs({ silent: false })} type="button">
            <span aria-hidden="true" className="material-symbols-outlined">refresh</span>
            Actualizar
          </button>
          <button className="btn btn-primary" disabled={testBusy} onClick={() => setTestConfirmOpen(true)} type="button">
            <span aria-hidden="true" className="material-symbols-outlined">outgoing_mail</span>
            Probar Resend
          </button>
        </div>
      </div>

      <div className="admin-operations-body">
        <div className="admin-operations-tabs" role="tablist" aria-label="Tipo de log">
          <button aria-selected={view === 'requests'} className={view === 'requests' ? 'selected' : ''} onClick={() => changeView('requests')} role="tab" type="button">
            Solicitudes API <span>{requestLogs.length}</span>
          </button>
          <button aria-selected={view === 'mail'} className={view === 'mail' ? 'selected' : ''} onClick={() => changeView('mail')} role="tab" type="button">
            Correos <span>{mailLogs.length}</span>
          </button>
        </div>

        <div className="admin-operations-filters">
          <label className="admin-operations-search">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input
              aria-label="Filtrar logs"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={view === 'requests' ? 'Ruta, request ID, email, estado o error' : 'Destinatario, asunto, estado o ID de Resend'}
              type="search"
              value={query}
            />
          </label>
          {view === 'requests' && (
            <select aria-label="Filtrar por metodo" onChange={(event) => setMethod(event.target.value)} value={method}>
              {METHOD_OPTIONS.map((value) => <option key={value || 'all'} value={value}>{value || 'Todos los metodos'}</option>)}
            </select>
          )}
          <select aria-label="Filtrar por estado" onChange={(event) => setStatus(event.target.value)} value={status}>
            {(view === 'requests' ? STATUS_OPTIONS : mailStatusOptions(mailLogs)).map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {testMessage && <div className="admin-profile-notice" role="status">{testMessage}</div>}
        {error && <div className="admin-profile-notice error" role="alert">{error}</div>}

        <div className="admin-operations-summary">
          <span>{visibleItems.length} registros visibles</span>
          <small>{view === 'requests' ? `Retencion configurada: ${retentionDays} dias. Se muestran hasta 500 requests recientes.` : 'Se muestran hasta 500 entregas recientes.'}</small>
        </div>

        {loading ? (
          <div className="admin-operations-empty" role="status"><span className="admin-spinner" aria-hidden="true" /> Cargando logs...</div>
        ) : visibleItems.length === 0 ? (
          <div className="admin-operations-empty">No hay registros que coincidan con los filtros.</div>
        ) : view === 'requests' ? (
          <RequestLogTable items={visibleRequestLogs} />
        ) : (
          <MailLogTable items={visibleMailLogs} />
        )}
      </div>

      {testConfirmOpen && (
        <div className="admin-modal-backdrop" onMouseDown={() => !testBusy && setTestConfirmOpen(false)} role="presentation">
          <div aria-labelledby="resend-test-title" aria-modal="true" className="admin-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <h3 id="resend-test-title">Enviar prueba real de Resend</h3>
            <p>Se enviara un correo operativo a <strong>{currentEmail}</strong>. La entrega quedara registrada en la vista Correos.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" disabled={testBusy} onClick={() => setTestConfirmOpen(false)} type="button">Cancelar</button>
              <button className="btn btn-primary" disabled={testBusy} onClick={sendResendTest} type="button">
                {testBusy ? 'Enviando prueba...' : 'Enviar prueba'}
                {testBusy && <span className="admin-button-spinner" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RequestLogTable({ items }) {
  return (
    <div className="admin-table-wrap admin-operations-table-wrap">
      <table className="admin-table admin-operations-table">
        <thead><tr><th>Fecha</th><th>Request</th><th>Estado</th><th>Usuario</th><th>Detalle</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id || `${item.requestId}-${item.createdAt}`}>
              <td><time dateTime={item.createdAt || ''}>{formatLogDate(item.createdAt)}</time></td>
              <td><strong className={`admin-method admin-method-${String(item.method || '').toLowerCase()}`}>{item.method}</strong><code>{item.path}</code></td>
              <td><span className={`admin-log-status ${requestStatusClass(item.status)}`}>{item.status}</span><small>{item.durationMs} ms</small></td>
              <td><span>{item.actorEmail || 'Publico'}</span><small>{item.originHost || 'Sin origen'}</small></td>
              <td><code>{item.requestId}</code>{item.errorMessage && <small className="admin-log-error">{item.errorMessage}</small>}{item.queryKeys?.length > 0 && <small>Query: {item.queryKeys.join(', ')}</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MailLogTable({ items }) {
  return (
    <div className="admin-table-wrap admin-operations-table-wrap">
      <table className="admin-table admin-operations-table">
        <thead><tr><th>Fecha</th><th>Correo</th><th>Estado</th><th>Proveedor</th><th>Detalle</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id || `${item.providerMessageId}-${item.createdAt}`}>
              <td><time dateTime={item.createdAt || ''}>{formatLogDate(item.createdAt)}</time></td>
              <td><strong>{item.subject || item.type || 'Correo'}</strong><small>{item.recipientEmail}</small></td>
              <td><span className={`admin-log-status ${mailStatusClass(item.status)}`}>{item.status || 'sin estado'}</span><small>{item.providerStatus || `${item.attempts || 0} intento(s)`}</small></td>
              <td><span>{item.provider || 'sin proveedor'}</span><small>{item.channel || 'sin canal'}</small></td>
              <td><code>{item.providerMessageId || 'Sin ID del proveedor'}</code>{item.lastError && <small className="admin-log-error">{item.lastError}</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function matchesText(item, query, fields) {
  const cleanQuery = String(query || '').trim().toLocaleLowerCase('es');
  if (!cleanQuery) return true;
  return fields.some((field) => String(item?.[field] || '').toLocaleLowerCase('es').includes(cleanQuery));
}

function matchesRequestStatus(value, filter) {
  const status = Number(value || 0);
  if (filter === 'success') return status >= 200 && status < 300;
  if (filter === 'redirect') return status >= 300 && status < 400;
  if (filter === 'client-error') return status >= 400 && status < 500;
  if (filter === 'server-error') return status >= 500;
  return true;
}

function matchesMailStatus(value, filter) {
  if (!filter) return true;
  return String(value || '').toLowerCase() === filter;
}

function mailStatusOptions(items) {
  const statuses = [...new Set(items.map((item) => item.status).filter(Boolean))].sort();
  return [{ value: '', label: 'Todos los estados' }, ...statuses.map((value) => ({ value, label: value }))];
}

function requestStatusClass(status) {
  const value = Number(status || 0);
  if (value >= 500) return 'error';
  if (value >= 400) return 'warning';
  if (value >= 300) return 'redirect';
  return 'success';
}

function mailStatusClass(status) {
  if (['failed', 'bounced', 'complained', 'suppressed'].includes(status)) return 'error';
  if (['pending', 'queued'].includes(status)) return 'warning';
  return 'success';
}

function formatLogDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}
