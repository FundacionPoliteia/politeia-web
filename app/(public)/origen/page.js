import Link from 'next/link';

export const metadata = { title: 'Origen — Politeia' };

// NOTA: este texto es provisorio, escrito a partir de la info pública de Politeia.
// Reemplazalo con lo que prepare Desarrollo Institucional.
export default function OrigenPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Nuestro origen</span>
          <h1>Nacimos para acercar la política a la gente.</h1>
          <p className="lead">Politeia es una fundación de jóvenes que busca fortalecer el nexo que une al ciudadano con la política, de una forma innovadora y profesional.</p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap prose">
          <p>Politeia surge de una convicción simple: la política se entiende mejor cuando se la mira de cerca, con datos, con contexto y sin intermediarios que la vuelvan inaccesible. Desde Argentina, reunimos a jóvenes de distintas disciplinas —relaciones internacionales, derecho, economía, comunicación y tecnología— con la idea de tender un puente entre las instituciones y la ciudadanía.</p>

          <p>Lo que empezó como un espacio de análisis y publicación fue creciendo hasta convertirse en un conjunto de herramientas y proyectos: una revista de ideas, un observatorio de innovación política, y aplicaciones abiertas que ayudan a cualquier persona a participar mejor de la vida democrática.</p>

          <h2>Qué nos mueve</h2>
          <p>Creemos que la transparencia no es un fin en sí mismo, sino un punto de partida. Que la participación ciudadana mejora cuando la información es clara. Y que la tecnología, bien usada, puede acercar el Estado a las personas en lugar de alejarlo.</p>

          <div className="values">
            <div className="value">
              <h3>Transparencia</h3>
              <p>Abrimos los datos y los procesos para que cualquiera pueda entenderlos y usarlos.</p>
            </div>
            <div className="value">
              <h3>Participación</h3>
              <p>Diseñamos herramientas para que la ciudadanía sea protagonista, no espectadora.</p>
            </div>
            <div className="value">
              <h3>Innovación</h3>
              <p>Aplicamos tecnología y nuevas ideas a viejos problemas de la vida pública.</p>
            </div>
          </div>

          <div style={{ marginTop: '50px' }}>
            <Link href="/proyectos" className="btn btn-primary">Conocé nuestros proyectos →</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
