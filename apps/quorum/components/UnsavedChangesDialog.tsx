'use client';

import { useEffect, useRef } from 'react';

export default function UnsavedChangesDialog({
  title,
  dirty = true,
  busy = false,
  cancel,
  discard,
}: {
  title: string;
  dirty?: boolean;
  busy?: boolean;
  cancel: () => void;
  discard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);

  return <dialog ref={dialog} className="dialog warning-dialog" aria-labelledby="unsaved-section-title" onCancel={(event) => { event.preventDefault(); if (!busy) cancel(); }}>
    <span className="eyebrow">Cambios sin guardar</span>
    <h2 id="unsaved-section-title">{title}</h2>
    <p>{busy
      ? 'Hay una operación en curso. Esperá a que termine antes de salir; tus cambios no se van a descartar mientras se guarda.'
      : dirty ? 'Hay campos que difieren de la última versión guardada. Si continuás sin guardarlos, esos cambios se perderán.' : 'La operación terminó y los cambios quedaron guardados. Podés continuar a la sección que elegiste.'}</p>
    <div className="dialog-actions">
      <button type="button" className="button ghost" autoFocus onClick={cancel}>Seguir editando</button>
      <button type="button" className={dirty ? 'button danger' : 'button primary'} disabled={busy} onClick={discard}>{dirty ? 'Descartar y continuar' : 'Continuar'}</button>
    </div>
  </dialog>;
}
