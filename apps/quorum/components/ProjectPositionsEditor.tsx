'use client';

import { useState } from 'react';
import { projectPositionSchema, projectPositionsSchema, type Legislator, type ProjectPosition } from '@politeia/quorum-contracts';
import styles from './ProjectPositions.module.css';

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function legislatorRole(item: Legislator) {
  const office = item.office === 'diputado' ? 'Diputado/a' : item.office === 'senador' ? 'Senador/a' : 'Legislador/a';
  const bloc = item.bloc || item.party;
  return bloc ? `${office} · ${bloc}` : office;
}

export default function ProjectPositionsEditor({ items, legislators, savedItems, onSave, busy, canSave, onChange }: { items: ProjectPosition[]; legislators: Legislator[]; savedItems: ProjectPosition[]; onSave: (item: ProjectPosition) => Promise<ProjectPosition>; busy: boolean; canSave: boolean; onChange: (items: ProjectPosition[]) => void }) {
  const [removed, setRemoved] = useState<{ item: ProjectPosition; index: number } | null>(null);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  async function saveItem(item: ProjectPosition) {
    const parsed = projectPositionSchema.safeParse(item);
    if (!parsed.success) { setRowErrors((current) => ({ ...current, [item.id]: parsed.error.issues[0].message })); return; }
    setSavingId(item.id);
    setRowErrors((current) => ({ ...current, [item.id]: '' }));
    try {
      await onSave(parsed.data);
      setEditing((current) => { const next = new Set(current); next.delete(item.id); return next; });
      setSavedId(item.id);
      setActiveNameId(null);
    } catch (error) {
      setRowErrors((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : 'No pudimos guardar. Tu texto sigue disponible para reintentar.' }));
    } finally { setSavingId(null); }
  }
  const [activeNameId, setActiveNameId] = useState<string | null>(null);
  const validation = projectPositionsSchema.safeParse(items);
  const errors = validation.success ? [] : validation.error.issues;
  const update = (id: string, patch: Partial<ProjectPosition>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const suggestionsFor = (value: string) => {
    const query = normalize(value);
    if (!query) return [];
    return legislators.filter((item) => normalize(item.fullName).includes(query)).slice(0, 6);
  };
  const chooseLegislator = (id: string, legislator: Legislator) => {
    update(id, { name: legislator.fullName, role: legislatorRole(legislator) });
    setActiveNameId(null);
  };
  const move = (index: number, offset: number) => {
    const next = [...items];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return <section className={styles.editor}>
    <div className={styles.editorCounts}><span>{items.filter((item) => item.stance === 'for').length} a favor</span><span>{items.filter((item) => item.stance === 'against').length} en contra</span></div>
    {removed && <div className={styles.undo} role="status">Declaración eliminada.<button type="button" className="button compact" disabled={items.length >= 100} onClick={() => { const next = [...items]; next.splice(Math.min(removed.index, items.length), 0, removed.item); onChange(next); setRemoved(null); }}>Deshacer</button></div>}
    {errors.length > 0 && <ul className={styles.errors} aria-live="polite">{errors.map((error, index) => <li key={index}>{typeof error.path[0] === 'number' ? `Declaración ${error.path[0] + 1}: ` : ''}{error.message}</li>)}</ul>}
    <div className="panel-title"><h3>A favor / En contra</h3><button type="button" className="button compact" disabled={items.length >= 100} onClick={() => onChange([...items, { id: crypto.randomUUID(), stance: 'for', name: '', role: '', quote: '', sourceLabel: '', sourceUrl: '', date: null }])}>Agregar declaración</button></div>
    {!canSave && <p className={styles.nameHint}>Guardá primero los datos básicos del proyecto para habilitar el guardado individual.</p>}
    {items.map((item, index) => {
      const saved = savedItems.find((entry) => entry.id === item.id);
      const locked = Boolean(saved && JSON.stringify(saved) === JSON.stringify(item) && !editing.has(item.id));
      return <fieldset key={item.id} className={`${styles.editorRow} ${locked ? styles.lockedRow : ''}`} disabled={busy || savingId !== null}>
      <legend>{item.name || `Declaración ${index + 1}`}</legend>
      <div className={styles.rowSaveBar}>
        <span role="status">{locked ? 'Guardada en el borrador' : 'En edición'}</span>
        {locked ? <button type="button" className={styles.iconButton} aria-label={`Editar declaración de ${item.name}`} title="Editar declaración" onClick={() => { setEditing((current) => new Set(current).add(item.id)); setSavedId(null); }}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button> : <button type="button" className="button primary compact" disabled={!canSave} onClick={() => void saveItem(item)}>{savingId === item.id ? 'Guardando…' : 'Guardar declaración'}</button>}
      </div>
      {rowErrors[item.id] && <p className="message error" role="alert">{rowErrors[item.id]}</p>}
      {savedId === item.id && locked && <p className={styles.nameHint} role="status">Guardada. Se hará pública al publicar la revisión del proyecto.</p>}
      <div className={styles.actions}>{([-1, 1] as const).map((offset) => <button key={offset} type="button" className={styles.iconButton} disabled={index + offset < 0 || index + offset >= items.length} title={offset < 0 ? 'Mover arriba' : 'Mover abajo'} aria-label={offset < 0 ? 'Mover arriba' : 'Mover abajo'} onClick={() => move(index, offset)}><span className="material-symbols-outlined" aria-hidden="true">{offset < 0 ? 'arrow_upward' : 'arrow_downward'}</span></button>)}<button type="button" className={styles.iconButton} title="Eliminar declaración" aria-label="Eliminar declaración" onClick={() => { setRemoved({ item, index }); onChange(items.filter((entry) => entry.id !== item.id)); }}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button></div>
      <fieldset className={styles.fields} disabled={locked}>
      <legend className="sr-only">Contenido de la declaración</legend>
      <div className="form-grid">
        <label className="field">Postura<select value={item.stance} onChange={(e) => update(item.id, { stance: e.target.value as ProjectPosition['stance'] })}><option value="for">A favor</option><option value="against">En contra</option></select></label>
        <div className={`field ${styles.nameField}`}>
          <label htmlFor={`position-name-${item.id}`}>Nombre</label>
          <input id={`position-name-${item.id}`} required maxLength={160} value={item.name} autoComplete="off" onFocus={() => setActiveNameId(item.id)} onBlur={() => window.setTimeout(() => setActiveNameId((current) => current === item.id ? null : current), 120)} onChange={(e) => {
            const name = e.target.value;
            const match = legislators.find((legislator) => normalize(legislator.fullName) === normalize(name));
            update(item.id, match ? { name, role: legislatorRole(match) } : { name });
            setActiveNameId(item.id);
          }} />
          {activeNameId === item.id && suggestionsFor(item.name).length > 0 && <div className={styles.nameSuggestions} role="listbox" aria-label="Legisladores recomendados">{suggestionsFor(item.name).map((legislator) => <button key={legislator.id} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseLegislator(item.id, legislator)}><strong>{legislator.fullName}</strong><small>{legislator.office === 'diputado' ? 'Diputado/a' : legislator.office === 'senador' ? 'Senador/a' : 'Legislador/a'} · {legislator.bloc || legislator.party || 'Sin bloque'}</small></button>)}</div>}
          <small className={styles.nameHint}>Escribí un nombre o elegí una coincidencia para completar cargo y bloque.</small>
        </div>
        <label className="field">Cargo o espacio político<input maxLength={200} value={item.role} onChange={(e) => update(item.id, { role: e.target.value })} /></label>
        <label className="field">Fecha de la declaración<input type="date" value={item.date || ''} onChange={(e) => update(item.id, { date: e.target.value || null })} /></label>
      </div>
      <label className="field">Declaración<textarea required rows={5} maxLength={6000} value={item.quote} onChange={(e) => update(item.id, { quote: e.target.value })} /></label>
      <div className="form-grid"><label className="field">Nombre de la fuente<input maxLength={160} value={item.sourceLabel} onChange={(e) => update(item.id, { sourceLabel: e.target.value })} /></label><label className="field">Enlace a la fuente<input type="url" value={item.sourceUrl} onChange={(e) => update(item.id, { sourceUrl: e.target.value })} /></label></div>
      </fieldset>
    </fieldset>; })}
  </section>;
}
