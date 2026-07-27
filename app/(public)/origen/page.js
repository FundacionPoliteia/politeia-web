import Link from 'next/link';

export const metadata = { title: 'Origen — Politeia' };

export default function OrigenPage() {
  return (
    <main className="origin-page">
      <section className="page-hero origin-hero">
        <div className="wrap origin-hero__grid">
          <div>
            <span className="eyebrow">Nuestro origen</span>
            <h1>Nacimos para acercar la política a la gente.</h1>
            <p className="lead">
              Politeia es una fundación de jóvenes que busca fortalecer el nexo
              entre la ciudadanía y la política de una forma innovadora y
              profesional.
            </p>
          </div>

          <aside className="origin-hero__statement">
            <span className="material-symbols-outlined" aria-hidden="true">
              diversity_3
            </span>
            <p>
              La vida pública se vuelve más cercana cuando la información es
              clara, las instituciones se pueden comprender y participar deja
              de sentirse lejano.
            </p>
          </aside>
        </div>
      </section>

      <section className="sec origin-story">
        <div className="wrap origin-story__grid">
          <div className="origin-story__heading">
            <span className="eyebrow">Cómo empezamos</span>
            <h2>Una convicción simple que se convirtió en acción.</h2>
          </div>

          <div className="origin-story__copy">
            <p className="origin-story__lead">
              La política se entiende mejor cuando se la mira de cerca, con
              datos, contexto y sin intermediarios que la vuelvan inaccesible.
            </p>
            <p>
              Desde Argentina, reunimos a jóvenes de distintas disciplinas,
              relaciones internacionales, derecho, economía, comunicación y
              tecnología, con la idea de tender un puente entre las
              instituciones y la ciudadanía.
            </p>
            <p>
              Lo que empezó como un espacio de análisis y publicación fue
              creciendo hasta convertirse en un conjunto de herramientas y
              proyectos abiertos que ayudan a participar mejor de la vida
              democrática.
            </p>
          </div>
        </div>
      </section>

      <section className="sec origin-values">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Qué nos mueve</span>
            <h2>Principios para construir una ciudadanía más informada.</h2>
            <p>
              La transparencia es un punto de partida. La participación crece
              cuando la información se entiende y la tecnología trabaja a
              favor de las personas.
            </p>
          </div>

          <div className="values">
            <article className="value">
              <div className="value__heading">
                <span className="material-symbols-outlined" aria-hidden="true">
                  visibility
                </span>
                <h3>Transparencia</h3>
              </div>
              <p>
                Abrimos datos y procesos para que cualquier persona pueda
                comprenderlos y utilizarlos.
              </p>
            </article>
            <article className="value">
              <div className="value__heading">
                <span className="material-symbols-outlined" aria-hidden="true">
                  forum
                </span>
                <h3>Participación</h3>
              </div>
              <p>
                Diseñamos espacios y herramientas para una ciudadanía
                protagonista, no espectadora.
              </p>
            </article>
            <article className="value">
              <div className="value__heading">
                <span className="material-symbols-outlined" aria-hidden="true">
                  lightbulb
                </span>
                <h3>Innovación</h3>
              </div>
              <p>
                Aplicamos tecnología y nuevas ideas a los desafíos de la vida
                pública.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="sec origin-cta">
        <div className="wrap origin-cta__inner">
          <div>
            <span className="eyebrow">Politeia en acción</span>
            <h2>Conocé las iniciativas que nacen de estas ideas.</h2>
          </div>
          <Link href="/proyectos" className="btn btn-primary">
            Ver nuestros proyectos
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      </section>

    </main>
  );
}
