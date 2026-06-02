import Link from 'next/link';

export const metadata = { title: 'Proyectos — Politeia' };

// NOTA: contenido provisorio basado en proyectos reales de Politeia.
// Reemplazá con las fichas de Desarrollo Institucional cuando lleguen.
const PROYECTOS = [
  {
    nombre: 'Promesas',
    estado: 'Activo',
    desc: 'Una aplicación para comparar tus posturas con las de los partidos y candidatos antes de votar. Sin sesgos, con fuentes verificables.',
    link: 'https://politeiatest.vercel.app/',
    externo: true,
  },
  {
    nombre: 'Quorum',
    estado: 'En desarrollo',
    desc: 'Un seguimiento del Congreso en lenguaje claro: qué se vota, quién lo propone y cómo te afecta. Próximamente.',
    link: null,
    externo: false,
  },
  {
    nombre: 'Observatorio de Innovación',
    estado: 'Activo',
    desc: 'Investigación y análisis sobre políticas públicas, ambiente, derechos humanos, economía, innovación y relaciones internacionales.',
    link: '/blog',
    externo: false,
  },
  {
    nombre: 'Revista IDEAR',
    estado: 'Publicación',
    desc: 'Una revista de ideas donde jóvenes analistas debaten los grandes temas de la agenda pública argentina e internacional.',
    link: '/blog',
    externo: false,
  },
];

export default function ProyectosPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Nuestros proyectos</span>
          <h1>Ideas que se vuelven herramientas.</h1>
          <p className="lead">Cada proyecto de Politeia resuelve una pregunta concreta sobre cómo participar mejor de la vida democrática.</p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="cards">
            {PROYECTOS.map((p) => {
              const inner = (
                <>
                  <span className="badge" style={{ position: 'static', display: 'inline-block', marginBottom: '16px' }}>{p.estado}</span>
                  <h3>{p.nombre}</h3>
                  <p>{p.desc}</p>
                  {p.link && <span className="go">{p.externo ? 'Abrir →' : 'Ver más →'}</span>}
                </>
              );
              if (!p.link) {
                return <div key={p.nombre} className="card soon">{inner}</div>;
              }
              if (p.externo) {
                return <a key={p.nombre} className="card" href={p.link} target="_blank" rel="noopener">{inner}</a>;
              }
              return <Link key={p.nombre} className="card" href={p.link}>{inner}</Link>;
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
