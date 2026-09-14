'use client';

import { useEffect, useRef, useState } from 'react';
import { teamMemberInputSchema, teamMemberSchema, type TeamMember, type TeamMemberInput } from '@politeia/quorum-contracts';
import PhotoField from './PhotoField';
import TeamProfiles from './TeamProfiles';

const empty: TeamMemberInput = { fullName: '', role: '', organization: 'Fundación Politeia', area: '', bio: '', photoUrl: '', order: 0 };
type Props = { call: (path: string, init?: RequestInit) => Promise<any>; uploadImage: (file: File) => Promise<string>; onDirtyChange: (dirty: boolean) => void };
export default function TeamManager({ call, uploadImage, onDirtyChange }: Props) {
  const [items, setItems] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<TeamMemberInput>(empty);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const inFlight = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(selected?.draft || empty);
  useEffect(() => { onDirtyChange(dirty || uploading || busy); return () => onDirtyChange(false); }, [dirty, uploading, busy, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { let active = true;
    call('/v1/manage/team').then(body => { const parsed = teamMemberSchema.array().parse(body.items); if (active) setItems(parsed); })
      .catch(caught => { if (active) setError(caught.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [call]);
  function choose(item: TeamMember | null) {
    if (busy || uploading || (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos para cambiar de perfil?'))) return;
    setSelected(item); setForm(item?.draft || { ...empty }); setError(''); setMessage(''); setPreview(false);
  }
  function accept(item: TeamMember) {
    setSelected(item); setForm(item.draft);
    setItems(current => current.some(entry => entry.id === item.id) ? current.map(entry => entry.id === item.id ? item : entry) : [...current, item]);
  }
  async function refresh() {
    if (busy || uploading || (dirty && !window.confirm('¿Descartar los cambios de esta pantalla y cargar los perfiles guardados?'))) return;
    setBusy(true); setError('');
    try {
      const body = await call('/v1/manage/team');
      const next = teamMemberSchema.array().parse(body.items);
      const current = next.find(item => item.id === selected?.id) || null;
      setItems(next); setSelected(current); setForm(current?.draft || { ...empty });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos recargar.'); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    const parsed = teamMemberInputSchema.safeParse(form);
    if (!parsed.success) throw new Error(parsed.error.issues.map(issue => issue.message).join(' '));
    const draft = parsed.data;
    const body = await call(selected ? `/v1/manage/team/${selected.id}` : '/v1/manage/team', {
      method: selected ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(selected ? { version: selected.version, draft } : draft),
    });
    const item = teamMemberSchema.parse(body.item);
    if (JSON.stringify(item.draft) !== JSON.stringify(draft)) throw new Error('El servidor no confirmó el perfil completo. Conservamos tus cambios.');
    accept(item); return item;
  }
  async function act(action: 'save' | 'publish' | 'unpublish') {
    if (busy || uploading || inFlight.current) return;
    if (action !== 'save' && !window.confirm(action === 'publish' ? '¿Guardar los cambios y publicar este perfil en Nosotros de Quórum?' : '¿Despublicar este perfil? Dejará de aparecer en Nosotros; el borrador se conservará.')) return;
    inFlight.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      let item = selected;
      if (action === 'save' || (action === 'publish' && (dirty || !selected))) item = await saveDraft();
      if (action !== 'save' && item) {
        const body = await call(`/v1/manage/team/${item.id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: item.version }) });
        const updated = teamMemberSchema.parse(body.item);
        if (action === 'unpublish' && dirty) {
          setSelected(updated); setItems(current => current.map(entry => entry.id === updated.id ? updated : entry));
        } else accept(updated);
      }
      setMessage(action === 'save' ? 'Borrador guardado. La versión pública no cambió.' : action === 'publish' ? 'Perfil publicado en Nosotros.' : 'Perfil despublicado.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos guardar. Tus cambios siguen en pantalla.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const set = (key: keyof TeamMemberInput, value: string | number) => { setForm(current => ({ ...current, [key]: value })); setMessage(''); };
  if (loading) return <p role="status">Cargando perfiles de Quórum…</p>;
  return <section aria-label="Gestión de Nosotros"><p>Perfiles del equipo de Quórum, independientes de autores del blog y legisladores. Publicar un perfil no otorga acceso al gestor.</p><button className="button ghost" disabled={busy || uploading} onClick={() => void refresh()}>Recargar perfiles</button>
    <div className="admin-two"><aside className="admin-panel"><button className="button primary" disabled={busy || uploading} onClick={() => choose(null)}>Nuevo integrante</button><div className="table-list">{items.map(item => <button className="button ghost" key={item.id} disabled={busy || uploading} onClick={() => choose(item)}>{item.draft.fullName} · {item.published ? 'Publicado' : 'Borrador'}</button>)}</div></aside>
    <section className="admin-panel"><h2>{selected ? `Editar ${selected.draft.fullName}` : 'Nuevo integrante de Quórum'}</h2><p>{dirty ? 'Hay cambios sin guardar.' : 'Sin cambios pendientes.'}</p>
      <fieldset disabled={busy || uploading} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <div className="form-grid">{([['fullName', 'Nombre completo'], ['role', 'Función en Quórum'], ['organization', 'Organización'], ['area', 'Área o equipo de la organización']] as const).map(([key, label]) => <label className="field" key={key}>{label}<input value={form[key]} maxLength={160} onChange={event => set(key, event.target.value)} /></label>)}</div>
        <label className="field">Presentación del integrante<textarea rows={6} maxLength={6000} value={form.bio} onChange={event => set('bio', event.target.value)} /></label>
        <label className="field">Orden de aparición<input type="number" min={0} max={10000} step={1} value={form.order} onChange={event => set('order', Number(event.target.value))} /></label>
        <PhotoField value={form.photoUrl} name={form.fullName} onChange={url => set('photoUrl', url)} onUpload={async file => { setUploading(true); try { return await uploadImage(file); } finally { setUploading(false); } }} />
      </fieldset>
      {error && <p className="message error" role="alert">{error}</p>}{message && <p className="message" role="status">{message}</p>}
      <div className="dialog-actions"><button className="button ghost" onClick={() => setPreview(!preview)}>Vista previa</button><button className="button primary" disabled={busy || uploading || (!dirty && !!selected)} onClick={() => void act('save')}>Guardar borrador</button><button className="button dark" disabled={busy || uploading} onClick={() => void act('publish')}>Guardar y publicar</button>{selected?.published && <button className="button danger" disabled={busy || uploading} onClick={() => void act('unpublish')}>Despublicar</button>}</div>
      {preview && <section aria-label="Vista previa privada"><p>Vista previa privada del formulario; todavía no implica publicación.</p><TeamProfiles members={[{ ...form, id: selected?.id || 'preview' }]} /></section>}
    </section></div>
  </section>;
}
