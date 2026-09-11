'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { photoUrlSchema } from '@politeia/quorum-contracts';
import PersonPhoto from './PersonPhoto';

function isStoredPhoto(value: string) {
  try { return /^\/(?:api\/quorum\/)?v1\/public\/media\/[^/]+$/.test(new URL(value).pathname); }
  catch { return false; }
}

export default function PhotoField({ value, name, onChange, onUpload, disabled = false }: {
  value: string; name: string; onChange: (url: string) => void;
  onUpload: (file: File) => Promise<string>; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [replaceUrl, setReplaceUrl] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const uploadInFlight = useRef(false);
  const titleId = useId();
  const storedPhoto = isStoredPhoto(value);
  useEffect(() => {
    if (!pending) return;
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(pending.preview);
  }, [pending]);
  function choose(file?: File) {
    if (!file || uploadInFlight.current) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Elegí una imagen JPG, PNG, WebP o GIF.'); return;
    }
    setPending({ file, preview: URL.createObjectURL(file) });
  }
  async function upload() {
    if (!pending || uploadInFlight.current) return;
    uploadInFlight.current = true;
    setBusy(true); setError('');
    try {
      const url = await onUpload(pending.file);
      if (!url || !photoUrlSchema.safeParse(url).success) throw new Error('La subida no devolvió una foto válida. Reintentá.');
      onChange(url);
      setReplaceUrl(false);
      setPending(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos subir la foto.'); }
    finally { uploadInFlight.current = false; setBusy(false); }
  }
  return <><fieldset className="photo-field" disabled={disabled || busy}>
    <legend>Foto</legend>
    <div className="photo-field-content"><PersonPhoto url={value} name={name} large />
      <div>{storedPhoto && !replaceUrl ? <div className="field"><strong>Imagen cargada</strong><span>Podés elegir otro archivo o reemplazarla por un enlace.</span><button type="button" className="button ghost compact" onClick={() => setReplaceUrl(true)}>Usar una URL externa</button></div> : <label className="field">URL de la foto<input type="url" maxLength={2000} value={storedPhoto ? '' : value} aria-invalid={!photoUrlSchema.safeParse(value).success} placeholder="https://…" onChange={(event) => { setError(''); onChange(event.target.value); }} /></label>}
        <label className="field">O subir una imagen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; choose(file); }} /></label>
        {value && <button type="button" className="button ghost compact" onClick={() => { setError(''); setReplaceUrl(false); onChange(''); }}>Quitar foto</button>}
      </div></div>
    {busy && <p role="status">Subiendo foto…</p>}
    {error && !pending && <p className="message error" role="alert">{error}</p>}
    {value && !photoUrlSchema.safeParse(value).success && <p className="message error" role="alert">Ingresá una URL HTTP o HTTPS válida para la foto.</p>}
  </fieldset>{pending && createPortal(<dialog ref={dialog} className="dialog photo-confirm-dialog" aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    if (!uploadInFlight.current) { setPending(null); setError(''); }
  }}>
    <h2 id={titleId}>¿Subir esta foto?</h2>
    <img className="photo-confirm-preview" src={pending.preview} alt="Vista previa de la foto elegida" />
    <p>{pending.file.name}</p>
    <p>Esta vista previa está sólo en tu dispositivo. Al confirmar se subirá la imagen; después guardá la declaración o el perfil para conservar el cambio.</p>
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button ghost" disabled={busy} autoFocus onClick={() => { setPending(null); setError(''); }}>Cancelar</button><button type="button" className="button primary" disabled={busy} onClick={() => void upload()}>{busy ? 'Subiendo…' : 'Confirmar subida'}</button></div>
  </dialog>, document.body)}</>;
}
