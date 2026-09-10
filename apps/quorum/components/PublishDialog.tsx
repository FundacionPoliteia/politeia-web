'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Project, type ProjectChangeReport } from '@politeia/quorum-contracts';
import PublicationChanges from './PublicationChanges';

type Review = { title: string; report: ProjectChangeReport; token: string; baselineRevision: number | null; canNotifyFollowers: boolean };
export default function PublishDialog({ project, suggestedNotify, names, call, reload, notify, close }: {
  project: Project; suggestedNotify: boolean; names: Record<string, string>;
  call: (path: string, init?: RequestInit) => Promise<any>; reload: () => Promise<void>;
  notify: (value: string) => void; close: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [send, setSend] = useState(suggestedNotify);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    setLoading(true); setReview(null); setConfirming(false); setError('');
    try {
      const next = await call(`/v1/manage/projects/${project.id}/publication-review`);
      if (!next?.token || !Array.isArray(next?.report?.fields)) throw new Error('La API no devolvió la comparación. Actualizá el backend antes de publicar.');
      if (mounted.current) setReview(next);
    } catch (caught) { if (mounted.current) setError(caught instanceof Error ? caught.message : 'No pudimos comparar la publicación.'); }
    finally { if (mounted.current) setLoading(false); }
  }, [call, project.id]);
  useEffect(() => { mounted.current = true; dialog.current?.showModal(); void load(); return () => { mounted.current = false; }; }, [load]);
  async function submit() {
    if (!review) return;
    setBusy(true); setError('');
    try {
      await call(`/v1/manage/projects/${project.id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        changeSummary: summary, notifyFollowers: review.canNotifyFollowers && send, reviewToken: review.token,
      }) });
      try { await reload(); } catch { /* Publishing succeeded; do not invite a duplicate retry. */ }
      notify('La revisión fue publicada con el registro de secciones modificadas.'); close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos publicar.');
      setReview(null); setConfirming(false);
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="dialog publication-dialog" aria-labelledby="publish-title" onCancel={(event) => { if (busy) event.preventDefault(); else close(); }}>
    <span className="eyebrow">Nueva revisión inmutable</span><h2 id="publish-title">Publicar {review?.title || project.title}</h2>
    {loading && <p role="status">Comparando el borrador guardado con la última publicación…</p>}
    {review && <>
      <p className="field-help">{review.baselineRevision ? `Comparación contra la revisión publicada ${review.baselineRevision}.` : 'Este proyecto todavía no tiene una revisión publicada.'} Los cambios se calculan desde los datos guardados.</p>
      <PublicationChanges report={review.report} names={names} />
      {!confirming ? <>
        <label className="field"><span>Resumen del cambio (opcional)</span><textarea value={summary} maxLength={500} onChange={(event) => setSummary(event.target.value)} placeholder="Qué cambió y por qué" /></label>
        <p className="field-help">El registro automático de secciones y campos se conserva aunque dejes vacío el resumen.</p>
        {review.canNotifyFollowers && <label className="check-row"><input type="checkbox" checked={send} onChange={(event) => setSend(event.target.checked)} /><span>Notificar a seguidores{suggestedNotify ? ' (sugerido porque cambió la etapa)' : ' (opcional para esta actualización de la cronología)'}</span></label>}
      </> : <div className="confirmation-card"><strong>Confirmá antes de hacer público el cambio</strong><dl><dt>Resumen</dt><dd>{summary.trim() || 'Sin resumen editorial'}</dd><dt>Secciones modificadas</dt><dd>{review.report.sections.length}</dd><dt>Seguidores</dt><dd>{review.canNotifyFollowers && send ? 'Se enviará una notificación' : 'No se enviarán notificaciones'}</dd></dl><p>Se publicará exactamente el borrador que acabás de revisar. Si otra sesión lo modifica, deberás actualizar la comparación.</p></div>}
    </>}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button className="button ghost" disabled={busy} onClick={close}>Cancelar</button>
      {!loading && !review && <button className="button primary" onClick={() => void load()}>Actualizar comparación</button>}
      {review && !confirming && <button className="button primary" onClick={() => setConfirming(true)}>Revisar publicación</button>}
      {review && confirming && <><button className="button ghost" disabled={busy} onClick={() => setConfirming(false)}>Volver</button><button className="button primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Publicando…' : 'Sí, publicar revisión'}</button></>}
    </div>
  </dialog>;
}
