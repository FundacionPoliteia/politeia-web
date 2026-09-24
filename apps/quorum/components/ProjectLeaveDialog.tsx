'use client';
import { useEffect, useRef } from 'react';

export default function ProjectLeaveDialog({ busy, error, cancel, discard, save }: {
  busy: boolean; error: string; cancel: () => void; discard: () => void; save: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className="dialog warning-dialog" aria-labelledby="unsaved-project-title" onCancel={(event) => { event.preventDefault(); if (!busy) cancel(); }}>
    <span className="eyebrow">Cambios sin guardar</span><h2 id="unsaved-project-title">¿Querés salir de este proyecto?</h2>
    <p>Hay campos que difieren de la última versión guardada. Si salís sin guardarlos, esos cambios se perderán.</p>
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="dialog-actions three-actions">
      <button type="button" className="button ghost" autoFocus disabled={busy} onClick={cancel}>Seguir editando</button>
      <button type="button" className="button danger" disabled={busy} onClick={discard}>Descartar y cambiar</button>
      <button type="button" className="button primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar y cambiar'}</button>
    </div>
  </dialog>;
}
