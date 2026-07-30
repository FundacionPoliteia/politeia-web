'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ProjectCard from '../../../components/ProjectCard';
import { PUBLIC_PROJECTS } from '../../../lib/publicProjects';

const NEWSLETTER_NUDGE_STORAGE_KEY = 'politeia:projects-newsletter-nudge';
const NEWSLETTER_NUDGE_COOLDOWN = 14 * 24 * 60 * 60 * 1000;

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function ProjectModalContent({ project }) {
  return (
    <div className="project-modal-content">
      <p className="project-modal-intro">{project.intro}</p>

      <div className="project-modal-sections">
        {project.sections?.map((section) => (
          <article className="project-detail-card" key={section.title}>
            <span
              aria-hidden="true"
              className="project-detail-icon material-symbols-outlined"
            >
              {section.icon}
            </span>

            <div>
              <h3>{section.title}</h3>

              {section.body && <p>{section.body}</p>}

              {section.items && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>

      {project.participants?.length > 0 && (
        <section className="project-team" aria-labelledby="project-team-title">
          <div className="project-team-heading">
            <span className="material-symbols-outlined" aria-hidden="true">
              groups
            </span>
            <h3 id="project-team-title">Coordinadores del proyecto</h3>
          </div>

          <div className="project-team-grid">
            {project.participants.map((participant) => (
              <article className="project-person-card" key={participant.name}>
                <div
                  aria-label={
                    participant.image
                      ? `Foto de ${participant.name}`
                      : `Foto pendiente de ${participant.name}`
                  }
                  className="project-person-avatar"
                  role="img"
                >
                  {participant.image ? (
                    <img
                      alt=""
                      height="58"
                      src={participant.image}
                      width="58"
                    />
                  ) : (
                    <>
                      <span className="project-person-initials">
                        {getInitials(participant.name)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="project-person-placeholder material-symbols-outlined"
                      >
                        add_a_photo
                      </span>
                    </>
                  )}
                </div>
                <strong>{participant.name}</strong>
                <small>{participant.role || 'Coordinador'}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {project.cta && (
        <a
          className="btn btn-primary project-modal-cta"
          href={project.cta.href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {project.cta.label}
          <span className="material-symbols-outlined" aria-hidden="true">
            open_in_new
          </span>
        </a>
      )}
    </div>
  );
}

function ProyectModal({ project, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const closeWithEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', closeWithEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, [onClose]);

  return (
    <div
      className="newsletter-result-overlay project-modal-overlay"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        aria-labelledby="project-modal-title"
        aria-modal="true"
        className="newsletter-result-modal proyect-preferences-modal project-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="project-modal-header">
          <span
            aria-hidden="true"
            className="proyect-result-icon material-symbols-outlined"
          >
            {project.icon}
          </span>

          <div className="project-modal-heading-copy">
            {project.eyebrow && (
              <span className="project-modal-eyebrow">{project.eyebrow}</span>
            )}
            <h2 id="project-modal-title">{project.title}</h2>
          </div>

          <button
            ref={closeButtonRef}
            aria-label="Cerrar"
            className="proyect-result-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              close
            </span>
          </button>
        </header>

        <ProjectModalContent project={project} />
      </div>
    </div>
  );
}

function NewsletterNudge({ hidden = false }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 860px)').matches;
    const dismissedAt = Number(window.localStorage.getItem(NEWSLETTER_NUDGE_STORAGE_KEY) || 0);
    if (!isMobile || Date.now() - dismissedAt < NEWSLETTER_NUDGE_COOLDOWN) return undefined;

    const timer = window.setTimeout(() => setVisible(true), 4500);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(NEWSLETTER_NUDGE_STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }, []);

  if (!visible || hidden) return null;

  return (
    <aside aria-label="Invitación al newsletter" className="project-newsletter-nudge" role="region">
      <button aria-label="Cerrar invitación" className="project-newsletter-nudge-close" onClick={dismiss} type="button">
        <span aria-hidden="true" className="material-symbols-outlined">close</span>
      </button>
      <span aria-hidden="true" className="project-newsletter-nudge-icon material-symbols-outlined">mail</span>
      <div>
        <strong>¿Querés recibir todas las novedades?</strong>
        <p>Notas y proyectos de Politeia, directo en tu correo.</p>
      </div>
      <a className="project-newsletter-nudge-link" href="/#news" onClick={dismiss}>
        Suscribirme
        <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
      </a>
    </aside>
  );
}

export default function ProyectosPage() {
  const [proyectoModal, setProyectoModal] = useState(null);

  useEffect(() => {
    const projectSlug = new URLSearchParams(window.location.search).get(
      'proyecto'
    );
    const project = PUBLIC_PROJECTS.find((item) => item.slug === projectSlug);

    if (project) setProyectoModal(project.modalData);
  }, []);

  const openModal = useCallback((project) => {
    setProyectoModal(project.modalData);

    const url = new URL(window.location.href);
    url.searchParams.set('proyecto', project.slug);
    window.history.replaceState({}, '', url);
  }, []);

  const closeModal = useCallback(() => {
    setProyectoModal(null);

    const url = new URL(window.location.href);
    url.searchParams.delete('proyecto');
    window.history.replaceState({}, '', url);
  }, []);

  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Nuestros proyectos</span>
          <h1>Ideas que se vuelven herramientas.</h1>
          <p className="lead">
            Cada proyecto de Politeia resuelve una pregunta concreta sobre cómo
            participar mejor de la vida democrática.
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="cards project-cards">
            {PUBLIC_PROJECTS.map((proyecto) => (
              <ProjectCard
                key={proyecto.nombre}
                onOpen={openModal}
                project={proyecto}
              />
            ))}
          </div>
        </div>
      </section>

      {proyectoModal && (
        <ProyectModal project={proyectoModal} onClose={closeModal} />
      )}
      <NewsletterNudge hidden={Boolean(proyectoModal)} />
    </main>
  );
}
