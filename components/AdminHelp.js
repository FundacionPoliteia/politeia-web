'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { HELP_GUIDE_VERSIONS, getAdminHelpTopic, getAdminHelpTopics } from '../lib/adminHelpContent';

const AdminHelpContext = createContext(null);

export function AdminHelpProvider({ activeArea, children, completedGuides = {}, onGuideComplete, ready = false, roles = [] }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef(null);
  const openedThisSessionRef = useRef(new Set());
  const topics = useMemo(() => getAdminHelpTopics(activeArea, roles), [activeArea, roles]);
  const guideVersion = HELP_GUIDE_VERSIONS[activeArea] || 1;
  const guideComplete = Number(completedGuides?.[activeArea] || 0) >= guideVersion;

  const openGuide = useCallback((topicId = '', source = null) => {
    if (!topics.length) return;
    const topicIndex = topicId ? topics.findIndex((topic) => topic.id === topicId) : 0;
    triggerRef.current = source || document.activeElement;
    setActiveIndex(topicIndex >= 0 ? topicIndex : 0);
    setGuideOpen(true);
  }, [topics]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    window.setTimeout(() => triggerRef.current?.focus?.(), 0);
  }, []);

  const completeGuide = useCallback(() => {
    onGuideComplete?.(activeArea, guideVersion);
    closeGuide();
  }, [activeArea, closeGuide, guideVersion, onGuideComplete]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeArea]);

  useEffect(() => {
    if (!ready || !topics.length || guideComplete || openedThisSessionRef.current.has(activeArea)) return undefined;
    const timer = window.setTimeout(() => {
      openedThisSessionRef.current.add(activeArea);
      openGuide();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [activeArea, guideComplete, openGuide, ready, topics.length]);

  useEffect(() => {
    if (!guideOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') closeGuide();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeGuide, guideOpen]);

  const contextValue = useMemo(() => ({
    activeArea,
    closeGuide,
    getTopic: (id) => getAdminHelpTopic(id, roles),
    guideOpen,
    openGuide,
    roles,
  }), [activeArea, closeGuide, guideOpen, openGuide, roles]);

  const activeTopic = topics[activeIndex] || topics[0] || null;

  return (
    <AdminHelpContext.Provider value={contextValue}>
      {children}
      {guideOpen && activeTopic && typeof document !== 'undefined' && createPortal(
        <ContextHelpTray
          activeIndex={activeIndex}
          activeTopic={activeTopic}
          onClose={closeGuide}
          onComplete={completeGuide}
          onSelect={setActiveIndex}
          topics={topics}
        />,
        document.body
      )}
      <HelpSpotlight active={guideOpen} target={activeTopic?.target} />
    </AdminHelpContext.Provider>
  );
}

export function AdminHelpNavButton() {
  const help = useAdminHelp();
  return (
    <button
      aria-expanded={help?.guideOpen || false}
      aria-label="Abrir ayuda de esta seccion"
      className={`admin-help-nav-button ${help?.guideOpen ? 'active' : ''}`}
      onClick={(event) => help?.openGuide('', event.currentTarget)}
      type="button"
    >
      <span aria-hidden="true" className="material-symbols-outlined">help</span>
      <span>Ayuda</span>
    </button>
  );
}

export function HelpTrigger({ className = '', help: customHelp = null, label = 'Ver ayuda', topicId = '' }) {
  const context = useAdminHelp();
  const triggerId = useId().replaceAll(':', '');
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16, ready: false });
  const topic = customHelp || context?.getTopic(topicId);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) window.setTimeout(() => buttonRef.current?.focus(), 0);
  }, []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current || !popoverRef.current) return;
    const triggerRect = buttonRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const gutter = 12;
    const viewportPadding = 12;
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.right - popoverRect.width),
      window.innerWidth - popoverRect.width - viewportPadding
    );
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const top = spaceBelow >= popoverRect.height + gutter
      ? triggerRect.bottom + gutter
      : Math.max(viewportPadding, triggerRect.top - popoverRect.height - gutter);
    setPosition({ left, top, ready: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (popoverRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  if (!topic) return null;
  const popoverId = `admin-help-popover-${triggerId}`;
  const tooltipId = `admin-help-tooltip-${triggerId}`;

  return (
    <span className={`admin-help-trigger-wrap ${className}`.trim()}>
      <button
        aria-describedby={!open ? tooltipId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label}: ${topic.title}`}
        className="admin-help-trigger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true" className="material-symbols-outlined">help</span>
      </button>
      <span className="admin-help-tooltip" id={tooltipId} role="tooltip">{topic.summary}</span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          aria-labelledby={`${popoverId}-title`}
          className="admin-help-popover"
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          style={{ left: position.left, opacity: position.ready ? 1 : 0, top: position.top }}
        >
          <header>
            <span aria-hidden="true" className="material-symbols-outlined">lightbulb</span>
            <div>
              <small>Ayuda</small>
              <h3 id={`${popoverId}-title`}>{topic.title}</h3>
            </div>
            <button aria-label="Cerrar ayuda" className="admin-icon-button" onClick={() => close()} type="button">
              <span aria-hidden="true" className="material-symbols-outlined">close</span>
            </button>
          </header>
          <p>{topic.details || topic.summary}</p>
          {topic.outcome && <div className="admin-help-popover-note"><strong>Que pasa despues</strong><span>{topic.outcome}</span></div>}
          {topic.example && <div className="admin-help-popover-example"><strong>Ejemplo</strong><span>{topic.example}</span></div>}
          {topic.area === context?.activeArea && (
            <button className="admin-help-popover-guide" onClick={() => {
              close(false);
              context.openGuide(topic.id, buttonRef.current);
            }} type="button">
              Ver guia de esta seccion
              <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </span>
  );
}

export function HelpTooltip({ children, text }) {
  if (!text) return children;
  return (
    <span className="admin-control-tooltip">
      {children}
      <span role="tooltip">{text}</span>
    </span>
  );
}

export function FieldHelper({ counter = '', description = '', disabledReason = '', error = '', example = '', loading = '', topicId = '' }) {
  if (!counter && !description && !disabledReason && !error && !example && !loading && !topicId) return null;
  return (
    <div className={`admin-field-helper ${error ? 'is-error' : ''} ${loading ? 'is-loading' : ''}`}>
      <div>
        {error && <p role="alert"><span aria-hidden="true" className="material-symbols-outlined">error</span>{error}</p>}
        {!error && loading && <p role="status"><span aria-hidden="true" className="admin-button-spinner" />{loading}</p>}
        {!error && !loading && disabledReason && <p><span aria-hidden="true" className="material-symbols-outlined">lock</span>{disabledReason}</p>}
        {!error && !loading && !disabledReason && description && <p>{description}</p>}
        {!error && !loading && !disabledReason && example && <p className="admin-field-example">Ejemplo: {example}</p>}
      </div>
      {counter !== '' && <span className="admin-field-counter">{counter}</span>}
      {topicId && <HelpTrigger topicId={topicId} />}
    </div>
  );
}

export function helpTopicFromText(title, text, options = {}) {
  return {
    id: options.id || '',
    area: options.area || '',
    title,
    summary: options.summary || text,
    details: text,
    outcome: options.outcome || '',
    example: options.example || '',
  };
}

function ContextHelpTray({ activeIndex, activeTopic, onClose, onComplete, onSelect, topics }) {
  const trayRef = useRef(null);
  const lastStep = activeIndex === topics.length - 1;

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!trayRef.current?.contains(event.target)) onClose();
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [onClose]);

  return (
    <aside aria-label="Guia contextual" className="admin-help-tray" ref={trayRef}>
      <header className="admin-help-tray-head">
        <div>
          <span>Ayuda contextual</span>
          <h2>{areaTitle(activeTopic.area)}</h2>
          <p>Paso {activeIndex + 1} de {topics.length}</p>
        </div>
        <button aria-label="Cerrar guia" className="admin-icon-button" onClick={onClose} type="button">
          <span aria-hidden="true" className="material-symbols-outlined">close</span>
        </button>
      </header>
      <div aria-hidden="true" className="admin-help-progress"><span style={{ width: `${((activeIndex + 1) / topics.length) * 100}%` }} /></div>
      <nav aria-label="Pasos de la guia" className="admin-help-step-dots">
        {topics.map((topic, index) => (
          <button aria-label={`Ir a ${topic.title}`} className={index === activeIndex ? 'active' : ''} key={topic.id} onClick={() => onSelect(index)} type="button" />
        ))}
      </nav>
      <div aria-live="polite" className="admin-help-tray-body">
        <span aria-hidden="true" className="material-symbols-outlined">tips_and_updates</span>
        <h3>{activeTopic.title}</h3>
        <p>{activeTopic.details}</p>
        {activeTopic.outcome && <div className="admin-help-tray-note"><strong>Que pasa despues</strong><p>{activeTopic.outcome}</p></div>}
        {activeTopic.example && <div className="admin-help-tray-example"><strong>Ejemplo</strong><p>{activeTopic.example}</p></div>}
      </div>
      <footer className="admin-help-tray-actions">
        <button className="btn btn-ghost" onClick={onComplete} type="button">Omitir guia</button>
        <div>
          <button className="btn btn-ghost" disabled={activeIndex === 0} onClick={() => onSelect(activeIndex - 1)} type="button">Anterior</button>
          <button className="btn btn-primary" onClick={() => lastStep ? onComplete() : onSelect(activeIndex + 1)} type="button">
            {lastStep ? 'Finalizar' : 'Siguiente'}
          </button>
        </div>
      </footer>
    </aside>
  );
}

function HelpSpotlight({ active, target }) {
  useEffect(() => {
    if (!active || !target) return undefined;
    const element = document.querySelector(`[data-help-id="${target}"]`);
    if (!element) return undefined;
    element.classList.add('admin-help-highlight-target');
    const timer = window.setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => {
      window.clearTimeout(timer);
      element.classList.remove('admin-help-highlight-target');
    };
  }, [active, target]);
  return null;
}

function useAdminHelp() {
  return useContext(AdminHelpContext);
}

function areaTitle(area) {
  return ({
    access: 'Roles y permisos',
    blogs: 'Gestor de blogs',
    mailing: 'Mailing automatico',
    newsletter: 'Newsletter',
    profile: 'Mi perfil',
    profiles: 'Perfiles de autores',
  })[area] || 'Panel interno';
}
