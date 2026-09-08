'use client';
import { useState } from 'react';
import { emptyVoteCounts, voteChoices, voteLabels, votingResultSchema, type VotingResult, type VoteCounts, type Legislator } from '@politeia/quorum-contracts';
import VotingResults, { VoteChart } from './VotingResults';

function Counts({ value, onChange }: { value: VoteCounts; onChange: (value: VoteCounts) => void }) {
  return <div className="vote-count-fields">{voteChoices.map(key => <label key={key}>{voteLabels[key]}<input type="number" min="0" max="1000" step="1" value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value === '' ? 0 : Number(e.target.value) })} /></label>)}</div>;
}

export default function VotingEditor({ items, legislators, onChange, call }: { items: VotingResult[]; legislators: Legislator[]; onChange: (items: VotingResult[]) => void; call: (path: string, init?: RequestInit) => Promise<any> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = items.find(vote => vote.id === editingId) || null;
  const [errors, setErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [imported, setImported] = useState<VotingResult | null>(null);
  const [original, setOriginal] = useState<VotingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [importInfo, setImportInfo] = useState('');
  async function loadOfficial() {
    setBusy(true); setImportError(''); setImported(null);
    try {
      const result = await call('/v1/manage/integrations/votings/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: sourceUrl.trim() }) });
      setImported(result.item);
      setImportInfo(`${result.cached ? 'Copia en caché' : 'Acta descargada'} · Comprobada ${new Date(result.checkedAt).toLocaleString('es-AR')}. Revisá que corresponda a este proyecto y clasificá qué se votó.`);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'No se pudo importar el acta'); }
    finally { setBusy(false); }
  }
  const patch = (value: Partial<VotingResult>) => onChange(items.map(vote => vote.id === editingId ? { ...vote, ...value } : vote));
  function save() {
    const parsed = votingResultSchema.safeParse(editing);
    if (!parsed.success) { setErrors(parsed.error.issues.map(issue => issue.message)); return; }
    onChange(items.some(v => v.id === parsed.data.id) ? items.map(v => v.id === parsed.data.id ? parsed.data : v) : [...items, parsed.data]);
    setEditingId(null); setErrors([]);
  }
  function open(value: VotingResult) { if (!items.some(vote => vote.id === value.id)) onChange([...items, value]); setEditingId(value.id); setOriginal(null); setErrors([]); setSearch(''); }
  return <section className="nested-editor"><h3>Resultado de votaciones</h3><p>Cargá cada votación por separado. Se guarda con el proyecto y se hace pública al publicar una revisión. Los firmantes no determinan quién votó a favor.</p>
    <details className="vote-import"><summary>Importar acta oficial de Diputados o Senado</summary><p>Pegá el enlace directo al acta. La descarga se realiza en el backend; conservamos el original y podés editar la copia. No se publica automáticamente. Las actas ya consultadas se reutilizan durante 30 minutos.</p>
      <label>Enlace al acta oficial<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://www.senado.gob.ar/votaciones/detalleActa/…" /></label>
      <button type="button" className="button ghost" disabled={busy || !sourceUrl.trim() || Boolean(editing)} onClick={loadOfficial}>{busy ? 'Consultando acta…' : 'Consultar acta'}</button>
      {importError && <p className="message error" role="alert">{importError}</p>}
      {imported && <div><p role="status">{importInfo}</p><VotingResults items={[imported]} />
        {items.some(v => v.id === imported.id || v.official?.sourceUrl === imported.official?.sourceUrl) ? <p>Esta acta ya está incorporada. Editá la votación existente: no se reemplazan tus correcciones.</p> : <button type="button" className="button primary" disabled={Boolean(editing)} onClick={() => { open(imported); setImported(null); }}>Incorporar al borrador y revisar</button>}
        <button type="button" className="button ghost" onClick={() => setImported(null)}>Descartar consulta</button>
      </div>}
    </details>
    {items.map(vote => <div className="vote-editor-summary" key={vote.id}><span>{vote.chamber === 'deputies' ? 'Diputados' : 'Senado'} · {vote.date} · {vote.subject}</span><button className="button ghost" type="button" onClick={() => open(vote)}>Editar</button><button className="button danger" type="button" onClick={() => { if (window.confirm('¿Quitar esta votación del borrador? El cambio será público al publicar una revisión.')) onChange(items.filter(v => v.id !== vote.id)); }}>Quitar</button></div>)}
    <button type="button" className="button ghost" disabled={Boolean(editing)} onClick={() => open({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), subject: '', chamber: 'deputies', type: 'general', method: 'aggregate', outcome: 'pending', counts: emptyVoteCounts(), blocks: [], nominal: [], notes: '', sourceUrl: '' })}>Agregar votación</button>
    {editing && <div className="vote-editor-fields">
      <label>Cámara<select value={editing.chamber} onChange={e => patch({ chamber: e.target.value as VotingResult['chamber'] })}><option value="deputies">Diputados</option><option value="senate">Senado</option></select></label>
      <label>Fecha<input type="date" value={editing.date} onChange={e => patch({ date: e.target.value })} /></label>
      <label>Qué se votó<input value={editing.subject} onChange={e => patch({ subject: e.target.value })} placeholder="Proyecto en general, artículos 1 a 3, moción…" /></label>
      <label>Objeto<select value={editing.type} onChange={e => patch({ type: e.target.value as VotingResult['type'] })}><option value="unspecified">Sin clasificar: revisar acta</option><option value="general">En general</option><option value="particular">En particular</option><option value="motion">Moción</option></select></label>
      <label>Registro<select value={editing.method} onChange={e => patch({ method: e.target.value as VotingResult['method'] })}><option value="aggregate">Recuento numérico</option><option value="nominal">Nominal</option><option value="showOfHands">Por signos</option></select></label>
      <label>Resultado informado en el acta<select value={editing.outcome} onChange={e => patch({ outcome: e.target.value as VotingResult['outcome'] })}><option value="pending">Sin confirmar</option><option value="approved">Aprobada</option><option value="rejected">Rechazada</option></select></label>
      <p>No se infiere aprobación por mayoría de votos: depende de la regla aplicable a lo que se votó.</p>
      <label>Regla de mayoría informada<input value={editing.majorityRule || ''} onChange={e => patch({ majorityRule: e.target.value })} /></label>
      {editing.official && <div><p>Acta oficial vinculada. Las modificaciones quedan separadas del original.</p><button type="button" className="button ghost" disabled={busy} onClick={async () => { setBusy(true); try { const result = await call(`/v1/manage/integrations/votings/snapshots/${editing.official!.snapshotId}`); setOriginal(result.item); } catch (error) { setErrors([error instanceof Error ? error.message : 'No se pudo leer el original']); } finally { setBusy(false); } }}>Ver original conservado</button>{original && <details open><summary>Original oficial (sólo lectura)</summary><VotingResults items={[original]} /></details>}</div>}
      <label><input type="checkbox" checked={editing.counts !== null} onChange={e => patch({ counts: e.target.checked ? emptyVoteCounts() : null })} /> Hay recuento numérico disponible</label>
      {editing.counts && <><Counts value={editing.counts} onChange={counts => patch({ counts })} /><VoteChart counts={editing.counts} /></>}
      <details><summary>Detalle por bloques (opcional)</summary><p>Registrá el bloque al momento de la votación. Estos números desglosan los totales, no se suman a ellos.</p>
        {editing.blocks.map((block, index) => <div key={index}><label>Bloque<input value={block.name} onChange={e => patch({ blocks: editing.blocks.map((b, i) => i === index ? { ...b, name: e.target.value } : b) })} /></label><Counts value={block.counts} onChange={counts => patch({ blocks: editing.blocks.map((b, i) => i === index ? { ...b, counts } : b) })} /><button type="button" onClick={() => patch({ blocks: editing.blocks.filter((_, i) => i !== index) })}>Quitar bloque</button></div>)}
        <button type="button" onClick={() => patch({ blocks: [...editing.blocks, { name: '', counts: emptyVoteCounts() }] })}>Agregar bloque</button>
      </details>
      <details><summary>Detalle por persona (opcional)</summary><p>Podés completarlo parcialmente. Verificá la cámara y el bloque histórico antes de incorporarlo.</p><label>Buscar legislador<input value={search} onChange={e => setSearch(e.target.value)} /></label>
        {search.trim() && <ul>{legislators.filter(p => !editing.nominal.some(n => n.legislatorId === p.id) && p.fullName.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).slice(0, 15).map(person => <li key={person.id}><button type="button" onClick={() => { patch({ nominal: [...editing.nominal, { legislatorId: person.id, name: person.fullName, bloc: person.bloc || '', choice: 'yes' }] }); setSearch(''); }}>{person.fullName} · {person.bloc}</button></li>)}</ul>}
        {editing.nominal.map((person, index) => <div className="vote-person" key={person.legislatorId}><strong>{person.name}</strong><label>Bloque al votar<input value={person.bloc} onChange={e => patch({ nominal: editing.nominal.map((p, i) => i === index ? { ...p, bloc: e.target.value } : p) })} /></label><label>Voto<select value={person.choice} onChange={e => patch({ nominal: editing.nominal.map((p, i) => i === index ? { ...p, choice: e.target.value as typeof person.choice } : p) })}>{voteChoices.map(key => <option key={key} value={key}>{voteLabels[key]}</option>)}</select></label><button type="button" onClick={() => patch({ nominal: editing.nominal.filter(p => p.legislatorId !== person.legislatorId) })}>Quitar</button></div>)}
      </details>
      <label>Fuente oficial<input type="url" value={editing.sourceUrl} onChange={e => patch({ sourceUrl: e.target.value })} /></label><label>Aclaraciones<textarea value={editing.notes} onChange={e => patch({ notes: e.target.value })} /></label>
      {errors.length > 0 && <ul className="message error" role="alert">{errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
      <p>Los cambios forman parte del formulario del proyecto. Guardá el proyecto para conservarlos.</p><button type="button" className="button primary" onClick={save}>Validar y cerrar votación</button>
    </div>}
  </section>;
}
