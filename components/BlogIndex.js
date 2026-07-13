'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { taxonomyKey } from '../lib/taxonomy';

export default function BlogIndex({ posts = [], autorFiltro = '', authorProfile = null }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const filtrandoAutor = Boolean(autorFiltro);
  const authorName = authorProfile?.fullName || autorFiltro;
  const authorLead = authorProfile?.description || 'Publicaciones del autor, reunidas en un mismo lugar.';

  const postsPorAutor = useMemo(
    () => filtrarPorAutor(posts, autorFiltro),
    [posts, autorFiltro]
  );
  const postsFiltrados = useMemo(
    () => filtrarPorBusqueda(postsPorAutor, query),
    [postsPorAutor, query]
  );
  const secciones = useMemo(
    () => agruparPorCategoria(postsFiltrados),
    [postsFiltrados]
  );
  const hasFilters = filtrandoAutor || Boolean(query.trim());

  function scrollToCategory(sectionId, categoria) {
    setActiveCategory(categoria);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main>
      <section className="page-hero">
        <div className={filtrandoAutor && authorProfile?.photoUrl ? 'wrap blog-author-hero' : 'wrap'}>
          <div>
            <span className="eyebrow">Blog</span>
            <h1>{filtrandoAutor ? `Notas escritas por ${authorName}.` : 'Ideas para entender mejor lo publico.'}</h1>
            <p className="lead">
              {filtrandoAutor
                ? authorLead
                : 'Investigacion, analisis y opinion sobre politica, instituciones y participacion ciudadana.'}
            </p>
            {filtrandoAutor && (
              <Link href="/blog" className="btn btn-ghost blog-filter-clear">Ver todos</Link>
            )}
          </div>
          {filtrandoAutor && authorProfile?.photoUrl && (
            <aside className="blog-author-card" aria-label={`Perfil de ${authorName}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={authorProfile.photoUrl} alt="" />
            </aside>
          )}
        </div>
      </section>

      <section className="sec blog-index-section">
        <div className="wrap">
          <div className="blog-search-panel">
            <label htmlFor="blog-search">Buscar en el blog</label>
            <div className="blog-search-box">
              <span aria-hidden="true" className="material-symbols-outlined">search</span>
              <input
                id="blog-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Autor, titulo, categoria, tag o extracto"
              />
              {query && (
                <button aria-label="Limpiar busqueda" onClick={() => setQuery('')} type="button">
                  <span aria-hidden="true" className="material-symbols-outlined">close</span>
                </button>
              )}
            </div>
            <p>
              {postsFiltrados.length} {postsFiltrados.length === 1 ? 'nota visible' : 'notas visibles'}
              {hasFilters ? ' con los filtros actuales.' : '.'}
            </p>
          </div>

          {postsPorAutor.length === 0 && (
            <div className="empty">
              {filtrandoAutor
                ? 'No encontramos notas publicadas para este autor.'
                : 'No pudimos cargar las notas en este momento. Proba recargar la pagina.'}
            </div>
          )}

          {postsPorAutor.length > 0 && postsFiltrados.length === 0 && (
            <div className="empty">No encontramos notas que coincidan con esa busqueda.</div>
          )}

          {postsFiltrados.length > 0 && (
            <div className="blog-index-layout">
              <div className="blog-sections">
                {secciones.map((seccion) => {
                  const sectionId = categorySectionId(seccion.categoria);
                  return (
                    <section className="blog-category-section" id={sectionId} key={seccion.categoria}>
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
                              {p.extracto && <p className="post-excerpt">{p.extracto}</p>}
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
                  );
                })}
              </div>

              <aside className="blog-toc" aria-label="Categorias del blog">
                <span>Contenido</span>
                <h2>Categorias</h2>
                <nav>
                  {secciones.map((seccion) => {
                    const selected = activeCategory === seccion.categoria;
                    return (
                      <button
                        className={selected ? 'selected' : ''}
                        key={seccion.categoria}
                        onClick={() => scrollToCategory(categorySectionId(seccion.categoria), seccion.categoria)}
                        type="button"
                      >
                        <strong>{seccion.categoria}</strong>
                        <small>{seccion.posts.length}</small>
                      </button>
                    );
                  })}
                </nav>
              </aside>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function filtrarPorAutor(posts, autor) {
  const key = taxonomyKey(autor);
  if (!key) return posts;
  return posts.filter((post) => taxonomyKey(post.autor) === key);
}

function filtrarPorBusqueda(posts, query) {
  const key = taxonomyKey(query);
  if (!key) return posts;
  return posts.filter((post) => searchablePostText(post).includes(key));
}

function searchablePostText(post) {
  return taxonomyKey([
    post.autor,
    post.titulo,
    post.categoria,
    post.extracto,
    ...(post.tags || []),
  ].filter(Boolean).join(' '));
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

function categorySectionId(categoria) {
  const key = taxonomyKey(categoria).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `categoria-${key || 'notas'}`;
}

function etiquetasPost(post, fallback = 'Nota') {
  return Array.isArray(post?.tags) && post.tags.length ? post.tags : [fallback];
}

function hrefAutorBlog(autor) {
  return `/blog?autor=${encodeURIComponent(autor || '')}`;
}

function formatearFecha(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch (e) {
    return '';
  }
}
