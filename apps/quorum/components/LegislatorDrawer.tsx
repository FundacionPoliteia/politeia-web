'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Legislator, PublicLegislatorAttribution } from '@politeia/quorum-contracts';
import { formatDate } from '@/lib/api';

export default function LegislatorDrawer({ author, signatories, profiles }: { author: PublicLegislatorAttribution | null; signatories: PublicLegislatorAttribution[]; profiles: Legislator[] }) {
  const [selected, setSelected] = useState<PublicLegislatorAttribution | null>(null);
  const [showAllSignatories, setShowAllSignatories] = useState(false);
  const [signatoryQuery, setSignatoryQuery] = useState('');
  const selectedProfile = selected ? profiles.find((item) => item.id === selected.id) || null : null;
  const openerRef = useRef<HTMLButtonElement | null>(null); const closeRef = useRef<HTMLButtonElement>(null); const modalRef = useRef<HTMLElement>(null);
  const signatoriesTriggerRef = useRef<HTMLButtonElement>(null); const signatoriesCloseRef = useRef<HTMLButtonElement>(null); const signatoriesModalRef = useRef<HTMLElement>(null);
  const previewSignatories = signatories.slice(0, 6);
  const filteredSignatories = useMemo(() => {
    const query = normalize(signatoryQuery);
    return query ? signatories.filter((person) => normalize(`${person.fullName} ${person.bloc} ${person.party} ${person.district}`).includes(query)) : signatories;
  }, [signatories, signatoryQuery]);

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', keyboard); };
  }, [selected]);

  useEffect(() => {
    if (!showAllSignatories) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    signatoriesCloseRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeSignatories(); return; }
      if (event.key !== 'Tab' || !signatoriesModalRef.current) return;
      const focusable = [...signatoriesModalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', keyboard); };
  }, [showAllSignatories]);

  function open(person: PublicLegislatorAttribution, event: ReactMouseEvent<HTMLButtonElement>) { openerRef.current = event.currentTarget; setSelected(person); }
  function openFromSignatories(person: PublicLegislatorAttribution) { openerRef.current = signatoriesTriggerRef.current; setShowAllSignatories(false); setSelected(person); }
  function close() { setSelected(null); requestAnimationFrame(() => openerRef.current?.focus()); }
  function closeSignatories() { setShowAllSignatories(false); setSignatoryQuery(''); requestAnimationFrame(() => signatoriesTriggerRef.current?.focus()); }

  if (!author && !signatories.length) return null;
  return <>
    <div className="project-people">
      {author && <section className="project-people-group"><span className="project-people-label">Autoría</span><button className="author-card" type="button" onClick={(event) => open(author, event)}><span><strong>{author.fullName}</strong><small>{personSummary(author)}</small></span><span aria-hidden="true">Ver datos →</span></button></section>}
      {signatories.length > 0 && <section className="project-people-group"><div className="project-people-heading"><span className="project-people-label">Firmantes</span><strong>{signatories.length}</strong></div><div className="people">{previewSignatories.map((person) => <button className="person-chip" type="button" key={person.id} onClick={(event) => open(person, event)}><strong>{person.fullName}</strong><small>{person.bloc || person.party || officeLabel(person.office)}</small></button>)}</div>{signatories.length > previewSignatories.length && <button ref={signatoriesTriggerRef} className="button ghost signatories-show-all" type="button" onClick={() => { setSignatoryQuery(''); setShowAllSignatories(true); }}>Ver los {signatories.length} firmantes <span aria-hidden="true">→</span></button>}</section>}
    </div>
    {showAllSignatories && <div className="legislator-modal-backdrop" onMouseDown={closeSignatories}>
      <section ref={signatoriesModalRef} className="signatories-modal" role="dialog" aria-modal="true" aria-labelledby="signatories-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button ref={signatoriesCloseRef} className="legislator-modal-close" type="button" aria-label="Cerrar lista de firmantes" onClick={closeSignatories}>×</button>
        <header className="signatories-modal-header"><span className="eyebrow">Autoría y firmas</span><div><h2 id="signatories-modal-title">Todos los firmantes</h2><strong>{signatories.length}</strong></div><p>Seleccioná una persona para consultar sus datos de atribución.</p></header>
        <label className="control signatories-search"><span>Buscar dentro de los firmantes</span><input type="search" value={signatoryQuery} onChange={(event) => setSignatoryQuery(event.target.value)} placeholder="Nombre, bloque, partido o distrito" /></label>
        <div className="signatories-modal-summary" aria-live="polite"><strong>{filteredSignatories.length}</strong> {filteredSignatories.length === 1 ? 'coincidencia' : 'coincidencias'}</div>
        {filteredSignatories.length ? <div className="people signatories-modal-list">{filteredSignatories.map((person) => <button className="person-chip" type="button" key={person.id} onClick={() => openFromSignatories(person)}><strong>{person.fullName}</strong><small>{personSummary(person)}</small></button>)}</div> : <div className="empty-state"><strong>No encontramos firmantes.</strong><span>Probá con otro nombre, bloque, partido o distrito.</span></div>}
      </section>
    </div>}
    {selected && <div className="legislator-modal-backdrop" onMouseDown={close}>
      <section ref={modalRef} className="legislator-modal" role="dialog" aria-modal="true" aria-labelledby="legislator-modal-name" aria-describedby={!selectedProfile ? 'legislator-modal-status' : undefined} onMouseDown={(event) => event.stopPropagation()}>
        <button ref={closeRef} className="legislator-modal-close" type="button" aria-label="Cerrar perfil" onClick={close}>×</button>
        <header className="legislator-modal-header"><span className="eyebrow">{selectedProfile ? 'Perfil legislativo' : 'Datos de atribución'}</span><h2 id="legislator-modal-name">{selected.fullName}</h2>{selectedProfile && <span className="status-pill">Perfil público verificado</span>}</header>
        <dl className="legislator-modal-data">
          <div><dt>Cargo</dt><dd>{officeLabel(selected.office)}</dd></div>
          <div><dt>Distrito</dt><dd>{selected.district || 'Sin dato disponible'}</dd></div>
          <div><dt>Partido</dt><dd>{selected.party || 'Sin dato disponible'}</dd></div>
          <div><dt>Bloque</dt><dd>{selected.bloc || 'Sin dato disponible'}</dd></div>
          {selectedProfile && <><div><dt>Mandato</dt><dd>{formatDate(selectedProfile.mandateStart)} — {formatDate(selectedProfile.mandateEnd)}</dd></div><div><dt>Formación</dt><dd>{selectedProfile.academicTitle || 'Sin dato disponible'}</dd></div>{selectedProfile.attendance && <div className="legislator-modal-data-wide"><dt>Asistencia</dt><dd>{selectedProfile.attendance.value}% al {formatDate(selectedProfile.attendance.asOf)} · <a href={selectedProfile.attendance.sourceUrl} target="_blank" rel="noreferrer">Consultar fuente ↗</a></dd></div>}</>}
        </dl>
        {selectedProfile?.bio && <section className="legislator-modal-bio"><h3>Perfil</h3><p>{selectedProfile.bio}</p></section>}
        {!selectedProfile && <div className="legislator-modal-status" id="legislator-modal-status"><strong>Perfil ampliado en preparación</strong><p>Estos datos de autoría o firma fueron aprobados al publicar el proyecto. La biografía completa todavía está en revisión editorial.</p></div>}
        <footer className="legislator-modal-actions">{selectedProfile && <Link className="button primary" href={`/legisladores/${selectedProfile.slug}`}>Ver perfil completo</Link>}<button className="button ghost" type="button" onClick={close}>Cerrar</button></footer>
      </section>
    </div>}
  </>;
}

function officeLabel(office: PublicLegislatorAttribution['office']) { return office === 'diputado' ? 'Diputado/a' : office === 'senador' ? 'Senador/a' : 'Otro cargo'; }
function personSummary(person: PublicLegislatorAttribution) { return [officeLabel(person.office), person.district, person.bloc || person.party].filter(Boolean).join(' · '); }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
