import Link from 'next/link';
import { getPosts, formatearFecha, etiquetasPost, hrefAutorBlog } from '../../../lib/blogApi';
import { taxonomyKey } from '../../../lib/taxonomy';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Blog - Politeia' };

export default async function BlogPage({ searchParams }) {
  const params = await searchParams;
  const autorFiltro = normalizarParametro(params?.autor);
  const posts = await getPosts(30);
  const postsFiltrados = filtrarPorAutor(posts, autorFiltro);
  const secciones = agruparPorCategoria(postsFiltrados);
  const filtrandoAutor = Boolean(autorFiltro);

  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Blog</span>
          <h1>{filtrandoAutor ? `Notas de ${autorFiltro}` : 'Analisis, ideas y debate.'}</h1>
          <p className="lead">
            {filtrandoAutor
              ? 'Publicaciones del autor, organizadas por categoria.'
              : 'Investigacion y opinion sobre politica, instituciones, relaciones internacionales y participacion ciudadana.'}
          </p>
          {filtrandoAutor && (
            <Link href="/blog" className="btn btn-ghost blog-filter-clear">Ver todos</Link>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          {postsFiltrados.length === 0 && (
            <div className="empty">
              {filtrandoAutor
                ? 'No encontramos notas publicadas para este autor.'
                : 'No pudimos cargar las notas en este momento. Proba recargar la pagina.'}
            </div>
          )}

          <div className="blog-sections">
            {secciones.map((seccion) => (
              <section className="blog-category-section" key={seccion.categoria}>
                <div className="blog-category-head">
                  <h2>{seccion.categoria}</h2>
                  <hr />
                </div>

                <div className="posts">
                  {seccion.posts.map((p) => (
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
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function normalizarParametro(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

function filtrarPorAutor(posts, autor) {
  const key = taxonomyKey(autor);
  if (!key) return posts;
  return posts.filter((post) => taxonomyKey(post.autor) === key);
}

function agruparPorCategoria(posts) {
  const grupos = new Map();

  posts.forEach((post) => {
    const categoria = post.categoria || 'Notas';
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria).push(post);
  });

  return Array.from(grupos, ([categoria, items]) => ({
    categoria,
    posts: items,
  }));
}
