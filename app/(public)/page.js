import Link from 'next/link';
import Hero from '../../components/Hero';
import NewsletterForm from '../../components/NewsletterForm';
import ProjectCard from '../../components/ProjectCard';
import { getPosts, formatearFecha, etiquetasPost, hrefAutorBlog } from '../../lib/blogApi';
import { PUBLIC_PROJECTS } from '../../lib/publicProjects';

const direccion = [
  {
    nombre: 'Francisco Oyuela',
    role: 'Presidente',
    foto: '/equipo/fran.png',
  },
  {
    nombre: 'Juana de Urquiza',
    role: 'Secretaria General',
    foto: '/equipo/juana.png',
  },
];

function obtenerIniciales(nombre) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

function TeamAvatar({ nombre, foto }) {
  if (foto) {
    return (
      <img
        className="home-team__avatar"
        src={foto}
        alt={`Foto de ${nombre}`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="home-team__avatar home-team__avatar--placeholder"
      aria-label={`Foto pendiente de ${nombre}`}
      role="img"
    >
      {obtenerIniciales(nombre)}
    </div>
  );
}

export default async function Home() {
  const posts = await getPosts(6);
  const ultimas = posts.slice(0, 3);

  return (
    <main>
      <Hero destacadas={posts} />

      {/* MARQUEE */}
      <div className="strip">
        <div className="strip-track">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => (
            <span key={k}>
              <span>Datos abiertos ·</span>
              <span>Participación ·</span>
              <span>Transparencia ·</span>
              <span>Análisis ·</span>
              <span>Ciudadanía ·</span>
            </span>
          ))}
        </div>
      </div>

      {/* PROYECTOS */}
      <section className="sec home-projects" id="proyectos">
        <div className="wrap">
          <div className="home-projects__head">
            <div className="sec-head">
              <span className="eyebrow">Nuestros proyectos</span>
              <h2>Ideas que se convierten en participación.</h2>
              <p>
                Iniciativas de investigación, formación y comunicación que
                acercan la vida pública a más personas.
              </p>
            </div>

            <Link href="/proyectos" className="btn btn-primary">
              Conocé todos los proyectos
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>

          <div className="cards project-cards home-projects__grid">
            {PUBLIC_PROJECTS.map((proyecto) => (
              <ProjectCard
                href={`/proyectos?proyecto=${proyecto.slug}`}
                key={proyecto.nombre}
                project={proyecto}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ENTORNO */}
      <section className="sec entorno" id="entorno">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Politeia</span>
            <h2>Herramientas para mirar la política de cerca.</h2>
            <p>Un conjunto de aplicaciones abiertas y gratuitas. Cada una resuelve una pregunta concreta.</p>
          </div>
          <div className="cards">
            <a className="card" href="https://politeiatest.vercel.app/" target="_blank" rel="noopener noreferrer">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
              </div>
              <h3>Promesas</h3>
              <p>Compará tus posturas con las de los partidos y candidatos antes de votar. Sin sesgos, con fuentes.</p>
              <span className="go">Abrir la app →</span>
            </a>
            <div className="card soon" aria-disabled="true">
              <span className="badge">Próximamente</span>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /><path d="M9 9v.01M9 12v.01M9 15v.01" /></svg>
              </div>
              <h3>Quórum</h3>
              <p>Seguí qué se vota en el Congreso, quién lo propone y cómo te afecta. En lenguaje claro.</p>
              <span className="go" style={{ color: 'var(--gris)' }}>En desarrollo</span>
            </div>
            <Link className="card" href="/blog">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
              </div>
              <h3>Blog</h3>
              <p>Análisis e investigación sobre política, instituciones y participación.</p>
              <span className="go">Ver artículos →</span>
            </Link>
          </div>
        </div>
      </section>

      {/* BLOG */}
      <section className="sec" id="blog">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Blog</span>
            <h2>Lo último que estamos pensando.</h2>
            <p>Análisis e investigación sobre política, instituciones y participación.</p>
          </div>
          <div className="posts">
            {ultimas.length === 0 && (
              <div className="empty">No pudimos cargar las notas en este momento.</div>
            )}
              {ultimas.map((p) => (
                <article key={p.id} className="post">
                  <Link href={`/blog/${p.slug}`} className="post-cover-link" aria-label={`Leer ${p.titulo}`}>
                    <div
                      className="post-img"
                      style={p.imagen ? { backgroundImage: `url('${p.imagen}')` } : {}}
                    ></div>
                  </Link>
                  <div className="post-body">
                    <div className="post-tags" aria-label="Tags">
                      {etiquetasPost(p).slice(0, 3).map((tag) => (
                        <span className="post-cat" key={tag}>{tag}</span>
                      ))}
                    </div>
                    <h4>
                      <Link href={`/blog/${p.slug}`} className="post-title-link">{p.titulo}</Link>
                    </h4>
                    <div className="meta">
                      {p.autor && (
                        <>
                          <Link href={hrefAutorBlog(p.autor)} className="post-author">{p.autor}</Link>
                          {' - '}
                        </>
                      )}
                      {formatearFecha(p.fecha)}
                    </div>
                  </div>
                </article>
              ))}
          </div>
          <div style={{ marginTop: '40px' }}>
            <Link href="/blog" className="btn btn-ghost">Ver todas las notas →</Link>
          </div>
        </div>
      </section>


      {/* EQUIPO */}
      <section className="sec home-team" id="equipo">
        <style>{`
          .home-team {
            overflow: hidden;
            border-top: 1px solid var(--linea);
            border-bottom: 1px solid var(--linea);
            background:
              radial-gradient(circle at 88% 18%, rgba(19, 122, 159, .12), transparent 28%),
              linear-gradient(180deg, var(--rosa) 0%, var(--blanco) 100%);
          }

          .home-team__head {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 32px;
            margin-bottom: 38px;
          }

          .home-team__head .sec-head {
            max-width: 760px;
            margin-bottom: 0;
          }

          .home-team__link {
            display: inline-flex;
            flex: 0 0 auto;
            align-items: center;
            justify-content: center;
            min-height: 46px;
            padding: 11px 19px;
            border: 1px solid var(--azul);
            border-radius: 999px;
            color: var(--blanco);
            background: var(--azul);
            font-size: .88rem;
            font-weight: 800;
            line-height: 1;
            text-decoration: none;
            transition:
              transform .2s ease,
              border-color .2s ease,
              background .2s ease,
              box-shadow .2s ease;
          }

          .home-team__link:hover {
            border-color: var(--tinta);
            background: var(--tinta);
            box-shadow: 0 12px 28px rgba(26, 26, 55, .14);
            transform: translateY(-2px);
          }

          .home-team__link:focus-visible {
            outline: 3px solid rgba(19, 122, 159, .28);
            outline-offset: 4px;
          }

          .home-team__grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 22px;
          }

          .home-team__card {
            display: flex;
            min-width: 0;
            align-items: center;
            gap: 20px;
            border: 1px solid var(--linea);
            border-radius: 16px;
            background: rgba(255, 255, 255, .86);
            padding: 24px;
            box-shadow: 0 14px 34px rgba(26, 26, 55, .06);
            backdrop-filter: blur(8px);
          }

          .home-team__avatar {
            width: 82px;
            height: 82px;
            flex: 0 0 82px;
            border: 4px solid var(--blanco);
            border-radius: 50%;
            object-fit: cover;
            box-shadow: 0 8px 22px rgba(26, 26, 55, .12);
          }

          .home-team__avatar--placeholder {
            display: grid;
            place-items: center;
            color: var(--tinta);
            background:
              linear-gradient(145deg, var(--rosa), #dff3f7);
            font-family: var(--display);
            font-size: 1.25rem;
            font-weight: 700;
          }

          .home-team__copy {
            min-width: 0;
          }

          .home-team__role {
            display: block;
            margin-bottom: 7px;
            color: var(--azul);
            font-size: .7rem;
            font-weight: 800;
            letter-spacing: .1em;
            text-transform: uppercase;
          }

          .home-team__copy h3 {
            margin: 0;
            color: var(--tinta);
            font-family: var(--display);
            font-size: clamp(1.15rem, 2vw, 1.45rem);
            font-weight: 600;
            line-height: 1.15;
          }

          @media (max-width: 900px) {
            .home-team__head {
              align-items: flex-start;
              flex-direction: column;
            }

            .home-team__grid {
              grid-template-columns: 1fr;
            }

            .home-team__link {
              width: 100%;
            }
          }

          @media (max-width: 480px) {
            .home-team__card {
              align-items: flex-start;
              padding: 20px;
            }

            .home-team__avatar {
              width: 68px;
              height: 68px;
              flex-basis: 68px;
            }
          }
        `}</style>

        <div className="wrap">
          <div className="home-team__head">
            <div className="sec-head">
              <span className="eyebrow">Quiénes somos</span>
              <h2>Las personas detrás de Politeia.</h2>
              <p>
                Un equipo interdisciplinario que trabaja para acercar la política,
                las relaciones internacionales y el conocimiento público a más personas.
              </p>
            </div>

            <Link href="/equipo" className="home-team__link">
              Conocé al equipo →
            </Link>
          </div>

          <div className="home-team__grid">
            {direccion.map((persona) => (
              <article className="home-team__card" key={persona.nombre}>
                <TeamAvatar nombre={persona.nombre} foto={persona.foto} />

                <div className="home-team__copy">
                  <span className="home-team__role">{persona.role}</span>
                  <h3>{persona.nombre}</h3>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="sec news" id="news">
        <div className="wrap">
          <div className="news-box">
            <h2>Recibí lo que importa, sin ruido.</h2>
            <p>Cada tanto, un mail con nuestras notas, novedades y lecturas sobre política y participación. Sin spam.</p>
            <NewsletterForm />
          </div>
        </div>
      </section>
    </main>
  );
}
