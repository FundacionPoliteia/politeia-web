import Link from 'next/link';
import Hero from '../components/Hero';
import NewsletterForm from '../components/NewsletterForm';
import { getPosts, formatearFecha } from '../lib/wordpress';

export default async function Home() {
  const posts = await getPosts(6);
  const ultimas = posts.slice(0, 3);

  return (
    <main>
      <Hero destacadas={posts} />

      {/* MARQUEE */}
      <div className="strip">
        <div className="strip-track">
          {[0, 1].map((k) => (
            <span key={k}>
              <span>Datos abiertos <b>·</b></span>
              <span>Participación <b>·</b></span>
              <span>Transparencia <b>·</b></span>
              <span>Análisis <b>·</b></span>
              <span>Ciudadanía <b>·</b></span>
            </span>
          ))}
        </div>
      </div>

      {/* ENTORNO */}
      <section className="sec entorno" id="entorno">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">El entorno Politeia</span>
            <h2>Herramientas para mirar la política de cerca.</h2>
            <p>Un conjunto de aplicaciones abiertas y gratuitas. Cada una resuelve una pregunta concreta.</p>
          </div>
          <div className="cards">
            <a className="card" href="https://politeiatest.vercel.app/" target="_blank" rel="noopener">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
              </div>
              <h3>Promesas</h3>
              <p>Compará tus posturas con las de los partidos y candidatos antes de votar. Sin sesgos, con fuentes.</p>
              <span className="go">Abrir la app →</span>
            </a>
            <div className="card soon">
              <span className="badge">Próximamente</span>
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /><path d="M9 9v.01M9 12v.01M9 15v.01" /></svg>
              </div>
              <h3>Quorum</h3>
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
              <Link key={p.id} href={`/blog/${p.slug}`} className="post">
                <div
                  className="post-img"
                  style={p.imagen ? { backgroundImage: `url('${p.imagen}')` } : {}}
                ></div>
                <div className="post-body">
                  <span className="post-cat">{p.categoria || 'Nota'}</span>
                  <h4>{p.titulo}</h4>
                  <div className="meta">
                    {p.autor ? `${p.autor} · ` : ''}{formatearFecha(p.fecha)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: '40px' }}>
            <Link href="/blog" className="btn btn-ghost">Ver todas las notas →</Link>
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
