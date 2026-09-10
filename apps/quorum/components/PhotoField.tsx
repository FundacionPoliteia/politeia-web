'use client';

import { useState } from 'react';
import { photoUrlSchema } from '@politeia/quorum-contracts';
import PersonPhoto from './PersonPhoto';

export default function PhotoField({ value, name, onChange, onUpload, disabled = false }: {
  value: string; name: string; onChange: (url: string) => void;
  onUpload: (file: File) => Promise<string>; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const url = await onUpload(file);
      if (!url || !photoUrlSchema.safeParse(url).success) throw new Error('La subida no devolvió una foto válida. Reintentá.');
      onChange(url);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos subir la foto.'); }
    finally { setBusy(false); }
  }
  return <fieldset className="photo-field" disabled={disabled || busy}>
    <legend>Foto</legend>
    <div className="photo-field-content"><PersonPhoto url={value} name={name} large />
      <div><label className="field">URL de la foto<input type="url" maxLength={2000} value={value} placeholder="https://…" onChange={(event) => onChange(event.target.value)} /></label>
        <label className="field">O subir una imagen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} /></label>
        {value && <button type="button" className="button ghost compact" onClick={() => onChange('')}>Quitar foto</button>}
      </div></div>
    {busy && <p role="status">Subiendo foto…</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    {value && !photoUrlSchema.safeParse(value).success && <p className="message error" role="alert">Ingresá una URL HTTP o HTTPS válida para la foto.</p>}
  </fieldset>;
}
