'use client';

import { useEffect, useRef, useState } from 'react';

const PROYECTOS = [
  {
    nombre: 'Coyuntura',
    estado: 'Activo',
    desc: 'Informamos y acercamos la política a la ciudadanía de manera dinámica e interactiva.',
    trigger: true,
    modalData: {
      eyebrow: 'Información y análisis político',
      icon: 'campaign',
      title: 'Coyuntura',
      intro:
        'Informamos y acercamos la política a la ciudadanía de manera dinámica e interactiva.',
      sections: [
        {
          icon: 'analytics',
          title: 'Análisis político',
          body:
            'Proponemos un espacio de reflexión e interpretación de la coyuntura a través de la elaboración de notas de opinión.',
        },
        {
          icon: 'newspaper',
          title: 'Cobertura',
          body:
            'Informamos sobre las principales noticias de la política nacional, manteniendo un tono neutral y orientado a la claridad informativa.',
        },
      ],
      participants: [
        { name: 'Denise Chmois', image: '/equipo/denise.png', role: 'Coordinadora' },
        { name: 'Rosario Inurrigarro', image: '/equipo/rosario.png', role: 'Coordinadora' },
        { name: 'Lourdes Ramos', image: '/equipo/lourdes.png', role: 'Coordinadora' },
      ],
    },
  },
  {
    nombre: 'Globeia',
    estado: 'Activo',
    desc: 'Democratizamos el conocimiento producido en el campo de las Relaciones Internacionales.',
    trigger: true,
    modalData: {
      eyebrow: 'Relaciones Internacionales',
      icon: 'public',
      title: 'Globeia',
      intro:
        'Difundimos, democratizamos e impulsamos el conocimiento producido en el campo de las Relaciones Internacionales.',
      sections: [
        {
          icon: 'target',
          title: '¿Qué buscamos?',
          items: [
            'Ampliar el acceso al conocimiento producido en el campo de las Relaciones Internacionales.',
            'Traducir conceptos teóricos a un lenguaje accesible sin perder rigurosidad.',
            'Visibilizar aportes individuales de jóvenes investigadores e investigadoras.',
            'Generar un insumo concreto y útil para la toma de decisiones en política exterior.',
            'Crear una red de acción entre participantes que impulse su colaboración en diversos ámbitos de las Relaciones Internacionales mediante Politeia.',
          ],
        },
      ],
      participants: [
        { name: 'Paula Pochettino', image: '/equipo/pochetino.jpg', role: 'Coordinadora' },
        { name: 'Camila Turner', image: '/equipo/camila.png', role: 'Coordinadora' },
      ],
    },
  },
  {
    nombre: 'Quorum',
    estado: 'En desarrollo',
    desc: 'Una web app para conocer candidaturas y comprender el accionar legislativo en lenguaje claro.',
    trigger: true,
    modalData: {
      eyebrow: 'Web app',
      icon: 'account_balance',
      title: 'Quorum',
      intro:
        'Informamos a la ciudadanía sobre los candidatos electorales y el accionar del Congreso Nacional y las legislaturas provinciales.',
      sections: [
        {
          icon: 'how_to_vote',
          title: 'En años electorales',
          body:
            'Busca acercar a la ciudadanía las propuestas políticas de los principales candidatos de cada partido, provincia y jurisdicción que disputan cargos electivos.',
        },
        {
          icon: 'gavel',
          title: 'En años no electorales',
          body:
            'Busca simplificar el debate legislativo para el ciudadano común mediante herramientas analíticas y estéticas, desde un aporte apartidario.',
        },
      ],
      participants: [
        { name: 'Valentina Díaz', image: '/equipo/valentina.png', role: 'Coordinadora' },
        { name: 'Guadalupe Perez', image: '/equipo/guadalupe.png', role: 'Coordinadora' },
      ],
    },
  },
  {
    nombre: 'PoliteZ',
    estado: 'Activo',
    desc: 'Una propuesta pedagógica y política impulsada por jóvenes para jóvenes.',
    trigger: true,
    modalData: {
      eyebrow: 'Educación democrática',
      icon: 'school',
      title: 'PoliteZ',
      intro:
        'A través de charlas en escuelas, PoliteZ busca acercar a los estudiantes a su primera experiencia democrática.',
      sections: [
        {
          icon: 'forum',
          title: 'La importancia de la política',
          body:
            'Un primer acercamiento al valor de la participación y al rol que ocupa la política en la vida cotidiana.',
        },
        {
          icon: 'ballot',
          title: 'El sistema electoral argentino',
          body:
            'Una explicación accesible de las instituciones, los procesos electorales y las distintas instancias de representación.',
        },
        {
          icon: 'history_edu',
          title: 'Historia del sufragio',
          body:
            'Un recorrido por la ampliación de los derechos políticos y la evolución del voto en Argentina.',
        },
      ],
      participants: [{ name: 'Sofía Walker', image: '/equipo/walker.png', role: 'Coordinadora' }],
      /* cta: {
        label: 'Visitar PoliteZ',
        href: 'https://politeiatest.vercel.app/',
      }, */
    },
  },
];

const ESTADO_BADGE = {
  Activo: 'badge-active',
  'En desarrollo': 'badge-development',
  Publicación: 'badge-publication',
};

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

        <header className="project-modal-header">
          <span
            aria-hidden="true"
            className="proyect-result-icon material-symbols-outlined"
          >
            {project.icon}
          </span>

          <div>
            {project.eyebrow && (
              <span className="project-modal-eyebrow">{project.eyebrow}</span>
            )}
            <h2 id="project-modal-title">{project.title}</h2>
          </div>
        </header>

        <ProjectModalContent project={project} />
      </div>
    </div>
  );
}

export default function ProyectosPage() {
  const [proyectoModal, setProyectoModal] = useState(null);

  const closeModal = () => setProyectoModal(null);

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
            {PROYECTOS.map((proyecto) => (
              <button
                key={proyecto.nombre}
                aria-haspopup="dialog"
                className="card card-trigger project-card"
                onClick={() => setProyectoModal(proyecto.modalData)}
                type="button"
              >
                <span
                  className={`badge project-badge ${
                    ESTADO_BADGE[proyecto.estado] || ''
                  }`}
                >
                  {proyecto.estado}
                </span>

                <h3>{proyecto.nombre}</h3>
                <p className="proyect-description">{proyecto.desc}</p>

                <span className="go">
                  Conocer el proyecto
                  <span className="material-symbols-outlined" aria-hidden="true">
                    arrow_forward
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {proyectoModal && (
        <ProyectModal project={proyectoModal} onClose={closeModal} />
      )}
    </main>
  );
}
