'use client';

import { useState } from 'react';
import { projectPositionsSchema, type ProjectPosition } from '@politeia/quorum-contracts';
import styles from './ProjectPositions.module.css';

export default function ProjectPositionsEditor({ items, onChange }: { items: ProjectPosition[]; onChange: (items: ProjectPosition[]) => void }) {
  const [removed, setRemoved] = useState<{ item: ProjectPosition; index: number } | null>(null);
  const validation = projectPositionsSchema.safeParse(items);
  const errors = validation.success ? [] : validation.error.issues;
  const update = (id: string, patch: Partial<ProjectPosition>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
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
    {items.map((item, index) => <fieldset key={item.id} className={styles.editorRow}>
      <legend>{item.name || `Declaración ${index + 1}`}</legend>
      <div className={styles.actions}>{([-1, 1] as const).map((offset) => <button key={offset} type="button" className={styles.iconButton} disabled={index + offset < 0 || index + offset >= items.length} title={offset < 0 ? 'Mover arriba' : 'Mover abajo'} aria-label={offset < 0 ? 'Mover arriba' : 'Mover abajo'} onClick={() => move(index, offset)}><span className="material-symbols-outlined" aria-hidden="true">{offset < 0 ? 'arrow_upward' : 'arrow_downward'}</span></button>)}<button type="button" className={styles.iconButton} title="Eliminar declaración" aria-label="Eliminar declaración" onClick={() => { setRemoved({ item, index }); onChange(items.filter((entry) => entry.id !== item.id)); }}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button></div>
      <div className="form-grid">
        <label className="field">Postura<select value={item.stance} onChange={(e) => update(item.id, { stance: e.target.value as ProjectPosition['stance'] })}><option value="for">A favor</option><option value="against">En contra</option></select></label>
        <label className="field">Nombre<input required maxLength={160} value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} /></label>
        <label className="field">Cargo o espacio político<input maxLength={200} value={item.role} onChange={(e) => update(item.id, { role: e.target.value })} /></label>
        <label className="field">Fecha de la declaración<input type="date" value={item.date || ''} onChange={(e) => update(item.id, { date: e.target.value || null })} /></label>
      </div>
      <label className="field">Declaración<textarea required rows={5} maxLength={6000} value={item.quote} onChange={(e) => update(item.id, { quote: e.target.value })} /></label>
      <div className="form-grid"><label className="field">Nombre de la fuente<input maxLength={160} value={item.sourceLabel} onChange={(e) => update(item.id, { sourceLabel: e.target.value })} /></label><label className="field">Enlace a la fuente<input type="url" value={item.sourceUrl} onChange={(e) => update(item.id, { sourceUrl: e.target.value })} /></label></div>
    </fieldset>)}
  </section>;
}
