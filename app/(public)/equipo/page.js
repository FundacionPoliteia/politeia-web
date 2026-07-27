import Link from 'next/link';

export const metadata = { title: 'Equipo — Politeia' };

const direccion = [
  {
    nombre: 'Francisco Oyuela',
    role: 'Presidente',
    foto: '/equipo/fran.png',
  },
  {
    nombre: 'Sofía Mejide',
    role: 'Co-fundadora',
    foto: '/equipo/sofia.png',
  },
  {
    nombre: 'Juana de Urquiza',
    role: 'Secretaria General',
    foto: '/equipo/juana.png',
  },
];

const projects = [
  {
    nombre: 'Coyuntura',
    miembros: [
      { nombre: 'Denise Chmois', foto: '/equipo/denise.png', role: 'Coordinadora' },
      { nombre: 'Rosario Inurrigarro', foto: '/equipo/rosario.png', role: 'Coordinadora' },
      { nombre: 'Lourdes Ramos', foto: '/equipo/lourdes.png', role: 'Coordinadora' },
    ],
  },
  {
    nombre: 'Globeia',
    miembros: [
      { nombre: 'Paula Pochettino', foto: '/equipo/pochetino.jpg', role: 'Coordinadora' },
      { nombre: 'Camila Turner', foto: '/equipo/camila.png', role: 'Coordinadora' },
    ],
  },
  {
    nombre: 'Quórum',
    miembros: [
      { nombre: 'Valentina Díaz', foto: '/equipo/valentina.png', role: 'Coordinadora' },
      { nombre: 'Guadalupe Pérez', foto: '/equipo/guadalupe.png', role: 'Coordinadora' },
    ],
  },
  {
    nombre: 'Desarrollo Institucional',
    miembros: [{ nombre: 'Belén Arias', foto: '/equipo/belen.png', role: 'Coordinadora' }],
  },
  {
    nombre: 'PoliteZ',
    miembros: [{ nombre: 'Sofía Walker', foto: '/equipo/walker.png', role: 'Coordinadora' }],
  },
];

const TEAM_STYLES = `
  .team-page {
    --team-blue-soft: #dff3f7;
    --team-surface: #fffdfc;
    --team-background: #fff8f4;
    min-height: 100vh;
    color: var(--tinta);
    background: var(--team-background);
  }

  .team-page * {
    box-sizing: border-box;
  }

  .team-page__container {
    width: min(1180px, calc(100% - 40px));
    margin-inline: auto;
  }

  .team-page__hero {
    padding: clamp(76px, 3vw, 128px) 0 clamp(0px, 2vw, 16px);
    background:
      radial-gradient(circle at 86% 18%, rgba(19, 122, 159, .14), transparent 29%),
      linear-gradient(180deg, var(--rosa) 0%, var(--team-background) 100%);
  }

  .team-page__hero-content {
    max-width: 800px;
  }

  .team-page__eyebrow,
  .team-page__section-kicker {
    display: inline-block;
    margin-bottom: 14px;
    color: var(--azul);
    font-size: .76rem;
    font-weight: 800;
    letter-spacing: .14em;
    text-transform: uppercase;
  }

  .team-page__hero h1,
  .team-page__section-heading h2,
  .team-page__leader-card h3,
  .team-page__team-header h3,
  .team-page__member-copy strong {
    font-family: var(--display);
  }

  .team-page__hero h1 {
    max-width: 760px;
    margin: 0 0 22px;
    font-size: clamp(2.65rem, 6vw, 5.2rem);
    font-weight: 500;
    line-height: .98;
    letter-spacing: -.05em;
  }

  .team-page__hero p {
    max-width: 700px;
    margin: 0;
    color: var(--gris);
    font-size: clamp(1rem, 2vw, 1.2rem);
    line-height: 1.7;
  }

  .team-page__section {
    padding: clamp(32px, 0vw, 56px) 0;
  }

  .team-page__leadership-section {
    border-bottom: 1px solid var(--linea);
    background: var(--blanco);
  }

  .team-page__section-heading {
    margin-bottom: 38px;
  }

  .team-page__section-heading--centered {
    text-align: center;
  }

  .team-page__section-heading--projects {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
  }

  .team-page__section-heading-copy {
    min-width: 0;
  }

  .team-page__projects-link {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-height: 46px;
    padding: 11px 18px;
    border: 1px solid var(--azul);
    border-radius: 999px;
    color: var(--blanco);
    background: var(--azul);
    font-size: .88rem;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
    transition: transform .2s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease;
  }

  .team-page__projects-link:hover {
    border-color: var(--tinta);
    background: var(--tinta);
    box-shadow: 0 12px 24px rgba(26, 26, 55, .14);
    transform: translateY(-2px);
  }

  .team-page__projects-link:focus-visible {
    outline: 3px solid rgba(19, 122, 159, .28);
    outline-offset: 4px;
  }

  .team-page__projects-link-arrow {
    font-size: 1.08rem;
    line-height: 1;
    transition: transform .2s ease;
  }

  .team-page__projects-link:hover .team-page__projects-link-arrow {
    transform: translateX(3px);
  }

  .team-page__section-heading h2 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.25rem);
    font-weight: 500;
    line-height: 1.08;
    letter-spacing: -.035em;
  }

  .team-page__leadership-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px;
    max-width: 980px;
    margin-inline: auto;
  }

  .team-page__leader-card {
    display: flex;
    min-height: 340px;
    padding: 34px 26px 28px;
    border: 1px solid var(--linea);
    border-radius: 26px;
    background: var(--blanco);
    box-shadow: 0 18px 48px rgba(26, 26, 55, .07);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .team-page__leader-content {
    margin-top: 22px;
  }

  .team-page__leader-card h3 {
    margin: 0;
    font-size: clamp(1.28rem, 2vw, 1.62rem);
    font-weight: 600;
    line-height: 1.2;
  }

  .team-page__role {
    display: block;
    margin-bottom: 8px;
    color: var(--azul);
    font-size: .76rem;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .team-page__avatar {
    display: grid;
    width: 68px;
    height: 68px;
    flex: 0 0 68px;
    overflow: hidden;
    border: 3px solid var(--azul);
    border-radius: 50%;
    object-fit: cover;
    place-items: center;
  }

  .team-page__avatar--large {
    width: 144px;
    height: 144px;
    flex-basis: 144px;
    border-width: 4px;
    font-size: 2rem;
  }

  .team-page__avatar--placeholder {
    position: relative;
    color: var(--tinta);
    background:
      radial-gradient(circle at 30% 25%, var(--blanco) 0 8%, transparent 9%),
      linear-gradient(145deg, var(--team-blue-soft), #f5fbfc);
    font-size: 1rem;
    font-weight: 850;
    letter-spacing: -.02em;
  }

  .team-page__teams-section {
    background: var(--team-background);
  }

  .team-page__teams-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 22px;
    align-items: stretch;
  }

  .team-page__team-card {
    grid-column: span 3;
    min-width: 0;
    padding: 26px;
    border: 1px solid var(--linea);
    border-radius: 24px;
    background: var(--team-surface);
    box-shadow: 0 18px 48px rgba(26, 26, 55, .06);
  }

  .team-page__team-card[data-count='3'],
  .team-page__team-card[data-count='1'] {
    grid-column: span 6;
  }

  .team-page__team-header {
    display: flex;
    min-height: 52px;
    margin-bottom: 20px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--linea);
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .team-page__team-header h3 {
    margin: 0;
    font-size: clamp(1.22rem, 2vw, 1.5rem);
    font-weight: 600;
    line-height: 1.2;
  }

  .team-page__member-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .team-page__team-card[data-count='3'] .team-page__member-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .team-page__team-card[data-count='3'] .team-page__member:last-child {
    grid-column: 1 / -1;
    width: min(100%, calc(50% - 6px));
    justify-self: center;
  }

  .team-page__member {
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    align-items: center;
    gap: 13px;
    min-width: 0;
    padding: 11px;
    border: 1px solid rgba(26, 26, 55, .08);
    border-radius: 17px;
    background: var(--blanco);
  }

  .team-page__member-copy {
    min-width: 0;
  }

  .team-page__member-copy strong {
    display: block;
    color: var(--tinta);
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .team-page__member-copy small {
    display: block;
    margin-top: 4px;
    color: var(--gris);
    font-size: .78rem;
    line-height: 1.35;
  }

  @media (max-width: 980px) {
    .team-page__leadership-grid {
      grid-template-columns: 1fr;
      max-width: 620px;
    }

    .team-page__leader-card {
      min-height: auto;
      flex-direction: row;
      justify-content: flex-start;
      text-align: left;
    }

    .team-page__leader-content {
      margin: 0 0 0 22px;
    }

    .team-page__team-card,
    .team-page__team-card[data-count='3'],
    .team-page__team-card[data-count='1'] {
      grid-column: span 6;
    }

    .team-page__team-card[data-count='3'] .team-page__member-list {
      grid-template-columns: 1fr;
    }

    .team-page__team-card[data-count='3'] .team-page__member:last-child {
      grid-column: auto;
      width: 100%;
      justify-self: stretch;
    }
  }

  @media (max-width: 680px) {
    .team-page__section-heading--projects {
      align-items: flex-start;
      flex-direction: column;
    }

    .team-page__projects-link {
      width: 100%;
    }

    .team-page__container {
      width: min(100% - 28px, 1180px);
    }

    .team-page__team-card,
    .team-page__team-card[data-count='3'],
    .team-page__team-card[data-count='1'] {
      grid-column: 1 / -1;
    }

    .team-page__leader-card {
      padding: 24px;
    }

    .team-page__avatar--large {
      width: 104px;
      height: 104px;
      flex-basis: 104px;
      font-size: 1.5rem;
    }
  }

  @media (max-width: 430px) {
    .team-page__leader-card {
      align-items: center;
      flex-direction: column;
      text-align: center;
    }

    .team-page__leader-content {
      margin: 20px 0 0;
      width: 100%;
    }

    .team-page__team-header {
      flex-direction: column;
    }
  }
`;

function obtenerIniciales(nombre) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

function Avatar({ nombre, foto, destacado = false }) {
  const className = [
    'team-page__avatar',
    destacado ? 'team-page__avatar--large' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (foto) {
    return (
      <img
        className={className}
        src={foto}
        alt={`Foto de ${nombre}`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`${className} team-page__avatar--placeholder`}
      aria-label={`Foto pendiente de ${nombre}`}
      role="img"
    >
      {obtenerIniciales(nombre)}
    </div>
  );
}

function MemberCard({ persona }) {
  const rol = persona.role || 'Coordinador';

  return (
    <div className="team-page__member">
      <Avatar {...persona} />

      <div className="team-page__member-copy">
        <strong>{persona.nombre}</strong>
        <small>{rol}</small>
      </div>
    </div>
  );
}

export default function EquipoPage() {
  return (
    <main className="team-page">
      <style>{TEAM_STYLES}</style>

      <section className="team-page__hero">
        <div className="team-page__container team-page__hero-content">
          <span className="team-page__eyebrow">Quiénes somos</span>
          <h1>Las personas detrás de Politeia</h1>
          <p>
            Un equipo interdisciplinario que trabaja para acercar la política,
            las relaciones internacionales y el conocimiento público a más
            personas.
          </p>
        </div>
      </section>

      <section
        className="team-page__section team-page__leadership-section"
        aria-labelledby="direccion-title"
      >
        <div className="team-page__container">
          <div className="team-page__section-heading team-page__section-heading--centered">
            <h2 id="direccion-title">Dirección General</h2>
          </div>

          <div className="team-page__leadership-grid">
            {direccion.map((persona) => (
              <article className="team-page__leader-card" key={persona.nombre}>
                <Avatar {...persona} destacado />

                <div className="team-page__leader-content">
                  <span className="team-page__role">{persona.role}</span>
                  <h3>{persona.nombre}</h3>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="team-page__section team-page__teams-section"
        aria-labelledby="equipos-title"
      >
        <div className="team-page__container">
          <div className="team-page__section-heading team-page__section-heading--projects">
            <div className="team-page__section-heading-copy">
              <span className="team-page__section-kicker">Áreas de trabajo</span>
              <h2 id="equipos-title">Equipos y proyectos</h2>
            </div>

            <Link className="team-page__projects-link" href="/proyectos">
              Ver más información
              <span className="team-page__projects-link-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </div>

          <div className="team-page__teams-grid">
            {projects.map((project) => (
              <article
                className="team-page__team-card"
                data-count={project.miembros.length}
                key={project.nombre}
              >
                <header className="team-page__team-header">
                  <h3>{project.nombre}</h3>
                </header>

                <div className="team-page__member-list">
                  {project.miembros.map((persona) => (
                    <MemberCard persona={persona} key={persona.nombre} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
