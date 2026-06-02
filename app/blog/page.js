import Link from 'next/link';
import { getPosts, formatearFecha } from '../../lib/wordpress';

export const metadata = { title: 'Blog — Politeia' };

export default async function BlogPage() {
  const posts = await getPosts(30);

  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Blog</span>
          <h1>Análisis, ideas y debate.</h1>
          <p className="lead">Investigación y opinión sobre política, instituciones, relaciones internacionales y participación ciudadana.</p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="posts">
            {posts.length === 0 && (
              <div className="empty">No pudimos cargar las notas en este momento. Probá recargar la página.</div>
            )}
            {posts.map((p) => (
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
        </div>
      </section>
    </main>
  );
}
