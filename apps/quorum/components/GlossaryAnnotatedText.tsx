'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { createPortal } from 'react-dom';
import type { GlossaryTerm } from '@politeia/quorum-contracts';
import { annotateGlossaryText, glossaryOccurrenceId, type GlossaryTextSegment } from '@/lib/glossary';
import MarkdownContent from '@/components/MarkdownContent';

export default function GlossaryAnnotatedText({ text, terms, sectionId, occurrenceSectionId = sectionId, occurrenceMode = 'all', occurrenceOffsets = {}, excludedOccurrenceIds = [], as: Tag = 'p' }: { text: string; terms: GlossaryTerm[]; sectionId: string; occurrenceSectionId?: string; occurrenceMode?: 'all' | 'first' | 'custom'; occurrenceOffsets?: Record<string, number>; excludedOccurrenceIds?: string[]; as?: ElementType }) {
  const localOrdinals = new Map<string, number>(); const excluded = new Set(excludedOccurrenceIds);
  const segments = annotateGlossaryText(text, terms, occurrenceMode === 'first' ? 'first' : 'all').map((segment) => {
    if (segment.type === 'text') return segment;
    const localOrdinal = localOrdinals.get(segment.term.id) || 0; localOrdinals.set(segment.term.id, localOrdinal + 1);
    const occurrenceId = glossaryOccurrenceId(occurrenceSectionId, segment.term.id, (occurrenceOffsets[segment.term.id] || 0) + localOrdinal);
    return occurrenceMode === 'custom' && excluded.has(occurrenceId) ? { type: 'text' as const, text: segment.text } : segment;
  }); const instanceId = useId();
  const [openKey, setOpenKey] = useState(''); const [pinned, setPinned] = useState(false); const [coarse, setCoarse] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number; placement: 'above' | 'below' } | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>()); const closeRef = useRef<HTMLButtonElement>(null); const modalRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSegment = segments.find((segment): segment is Extract<GlossaryTextSegment, { type: 'term' }> => segment.type === 'term' && segmentKey(segment) === openKey) || null;
  const activePopupId = activeSegment ? popupId(activeSegment) : '';

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)'); const update = () => setCoarse(media.matches || window.innerWidth <= 860); update();
    media.addEventListener('change', update); window.addEventListener('resize', update);
    return () => { media.removeEventListener('change', update); window.removeEventListener('resize', update); };
  }, []);
  useEffect(() => {
    const closeOther = (event: Event) => { if ((event as CustomEvent).detail !== instanceId) { setOpenKey(''); setPinned(false); } };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openKey) { close(true); return; }
      if (event.key !== 'Tab' || !pinned || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (pinned) return;
      const inline = event.target instanceof Element ? event.target.closest<HTMLElement>('.glossary-inline') : null;
      if (openKey && inline?.dataset.glossaryInstance !== instanceId) close();
    };
    window.addEventListener('quorum:glossary-open', closeOther); document.addEventListener('keydown', keyboard); document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('quorum:glossary-open', closeOther); document.removeEventListener('keydown', keyboard); document.removeEventListener('pointerdown', outside); };
  }, [instanceId, openKey, pinned]);
  useEffect(() => {
    if (!pinned || !openKey) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [openKey, pinned]);
  useEffect(() => {
    if (!openKey || coarse || pinned) return;
    const position = () => positionTooltip(openKey);
    position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [coarse, openKey, pinned]);
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  function segmentKey(segment: Extract<GlossaryTextSegment, { type: 'term' }>) { return `${sectionId}-${segment.term.id}-${segment.start}`; }
  function popupId(segment: Extract<GlossaryTextSegment, { type: 'term' }>) { return `glossary-${sectionId}-${segment.term.id}-${segment.start}`.replace(/[^a-zA-Z0-9_-]/g, '-'); }
  function positionTooltip(key: string) {
    const trigger = triggerRefs.current.get(key); if (!trigger) return;
    const rect = trigger.getBoundingClientRect(); const width = Math.min(330, window.innerWidth - 32); const center = rect.left + rect.width / 2;
    setTooltipPosition({ left: Math.max(16 + width / 2, Math.min(window.innerWidth - 16 - width / 2, center)), top: rect.top > 190 ? rect.top - 12 : rect.bottom + 12, placement: rect.top > 190 ? 'above' : 'below' });
  }
  function open(key: string, shouldPin: boolean) { if (!shouldPin) positionTooltip(key); setOpenKey(key); setPinned(shouldPin); window.dispatchEvent(new CustomEvent('quorum:glossary-open', { detail: instanceId })); }
  function close(returnFocus = false) { const key = openKey; if (hoverTimer.current) clearTimeout(hoverTimer.current); setOpenKey(''); setPinned(false); setTooltipPosition(null); if (returnFocus && key) requestAnimationFrame(() => triggerRefs.current.get(key)?.focus()); }

  return <>
    <Tag className="glossary-annotated-text">{segments.map((segment, index) => {
      if (segment.type === 'text') return <span key={`text-${index}`}>{segment.text}</span>;
      const key = segmentKey(segment); const id = popupId(segment); const active = openKey === key;
      const popoverStyle = tooltipPosition ? ({ left: tooltipPosition.left, top: tooltipPosition.top } satisfies CSSProperties) : undefined;
      return <dfn className={`glossary-inline${active ? ' active' : ''}`} data-glossary-instance={instanceId} key={key} onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); if (!coarse && !pinned) close(); }}>
        <button ref={(node) => { if (node) triggerRefs.current.set(key, node); else triggerRefs.current.delete(key); }} type="button" aria-haspopup="dialog" aria-expanded={active && pinned} aria-controls={active ? id : undefined} aria-describedby={active && !coarse && !pinned ? id : undefined}
          onMouseEnter={() => { if (!coarse && !pinned) { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => open(key, false), 140); } }} onFocus={() => { if (!coarse && !pinned) open(key, false); }}
          onBlur={(event) => { if (!coarse && !pinned && !event.currentTarget.parentElement?.contains(event.relatedTarget)) close(); }}
          onClick={() => open(key, true)}>{segment.text}<span aria-hidden="true" className="glossary-mark">?</span></button>
        {active && !coarse && !pinned && <span className={`glossary-popover ${tooltipPosition?.placement || 'above'}`} style={popoverStyle} id={id} role="tooltip">
          <strong>{segment.term.term}</strong><span>{segment.term.shortDefinition}</span><small>Click para abrir la definición completa</small>
        </span>}
      </dfn>;
    })}</Tag>
    {pinned && activeSegment && createPortal(
      <div className="glossary-modal-backdrop" onMouseDown={() => close(true)}>
        <section ref={modalRef} className="glossary-modal" id={activePopupId} role="dialog" aria-modal="true" aria-labelledby={`${activePopupId}-title`} aria-describedby={`${activePopupId}-definition`} onMouseDown={(event) => event.stopPropagation()}>
          <button className="glossary-modal-close" ref={closeRef} type="button" onClick={() => close(true)} aria-label="Cerrar definición">×</button>
          <header><span>Glosario de Quórum</span><strong id={`${activePopupId}-title`}>{activeSegment.term.term}</strong></header>
          {activeSegment.term.shortDefinition && <p className="glossary-modal-lead">{activeSegment.term.shortDefinition}</p>}
          <div className="glossary-modal-definition" id={`${activePopupId}-definition`}><MarkdownContent value={activeSegment.term.definition} format={activeSegment.term.definitionFormat} /></div>
          {activeSegment.term.references.length > 0 && <section className="glossary-modal-references" aria-labelledby={`${activePopupId}-references`}><h3 id={`${activePopupId}-references`}>Fuentes y referencias</h3><ul>{activeSegment.term.references.map((reference) => <li key={reference.id}><a href={reference.url} target="_blank" rel="noreferrer">{reference.label} <span aria-hidden="true">↗</span></a></li>)}</ul></section>}
          <footer><Link href={`/glosario/${activeSegment.term.slug}`}>Abrir ficha del glosario →</Link><button className="button ghost" type="button" onClick={() => close(true)}>Cerrar</button></footer>
        </section>
      </div>,
      document.body,
    )}
  </>;
}
