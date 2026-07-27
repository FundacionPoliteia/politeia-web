'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { taxonomyKey } from '../lib/taxonomy';
import NewsletterForm from './NewsletterForm';
import PostCard from './PostCard';

const DEFAULT_PROFILE_PHOTO = '/default_profile.png';

function BlogSearchControls({
  dateOrder,
  hasFilters,
  inputId,
  postsCount,
  query,
  setDateOrder,
  setQuery,
}) {
  return (
    <>
      <label htmlFor={inputId}>Buscar en el blog</label>
      <div className="blog-search-box">
        <span aria-hidden="true" className="material-symbols-outlined">search</span>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Autor, título, categoría, tag o extracto"
        />
        {query && (
          <button aria-label="Limpiar búsqueda" onClick={() => setQuery('')} type="button">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>
      <div className="blog-date-filter" aria-label="Ordenar notas por fecha" role="group">
        <span>Orden por fecha</span>
        <div>
          {[
            ['neutral', 'Orden actual'],
            ['newest', 'Más nuevos'],
            ['oldest', 'Más viejos'],
          ].map(([value, label]) => (
            <button
              aria-pressed={dateOrder === value}
              className={dateOrder === value ? 'is-active' : ''}
              key={value}
              onClick={() => setDateOrder(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p>
        {postsCount} {postsCount === 1 ? 'nota visible' : 'notas visibles'}
        {hasFilters ? ' con los filtros actuales.' : '.'}
      </p>
    </>
  );
}

function BlogSidebarContent({
  activeCategory,
  authors,
  idSuffix = '',
  onCategory,
  secciones,
  showAuthors,
}) {
  const authorsTitleId = `blog-sidebar-authors-title${idSuffix}`;

  return (
    <>
      <span>Contenido</span>
      <h2>Categorías</h2>
      <nav>
        {secciones.map((seccion) => {
          const selected = activeCategory === seccion.categoria;
          return (
            <button
              className={selected ? 'selected' : ''}
              key={seccion.categoria}
              onClick={() => onCategory(categorySectionId(seccion.categoria), seccion.categoria)}
              type="button"
            >
              <strong>{seccion.categoria}</strong>
              <small>{seccion.posts.length}</small>
            </button>
          );
        })}
      </nav>
      {showAuthors && authors.length > 0 && (
        <section className="blog-sidebar-authors" aria-labelledby={authorsTitleId}>
          <div className="blog-sidebar-authors-head">
            <span>Autores</span>
            <Link href="/blog/autores">Ver todos</Link>
          </div>
          <h3 id={authorsTitleId}>Conocé a quienes escriben</h3>
          <div className="blog-sidebar-authors-list">
            {authors.slice(0, 3).map((author) => (
              <Link
                href={hrefAutorBlog(author.fullName)}
                key={author.authorSlug || author.fullName}
                aria-label={`Ver notas de ${author.fullName}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={author.photoUrl || DEFAULT_PROFILE_PHOTO} alt="" />
                <span>
                  <strong>{author.fullName}</strong>
                  <small>{author.postCount} {author.postCount === 1 ? 'nota' : 'notas'}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default function BlogIndex({ posts = [], autorFiltro = '', categoriaFiltro = '', newsletterStatus = '', newsletterEmail = '', newsletterToken = '', authorProfile = null, authors = [], preview = false }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [dateOrder, setDateOrder] = useState('neutral');
  const filtrandoAutor = Boolean(autorFiltro && authorProfile);
  const filtrandoCategoria = Boolean(categoriaFiltro);
  const authorName = authorProfile?.fullName || '';
  const authorLead = authorProfile?.description || '';
  const authorFocusArea = authorProfile?.focusArea || '';
  const authorPhoto = authorProfile ? authorProfile.photoUrl || DEFAULT_PROFILE_PHOTO : '';
  const publicAuthorKeys = useMemo(
    () => new Set(authors.map((author) => taxonomyKey(author.fullName)).filter(Boolean)),
    [authors]
  );
  const Root = preview ? 'div' : 'main';

  const postsPorAutor = useMemo(
    () => filtrarPorCategoria(filtrarPorAutor(posts, filtrandoAutor ? autorFiltro : ''), categoriaFiltro),
    [posts, autorFiltro, categoriaFiltro, filtrandoAutor]
  );
  const postsFiltrados = useMemo(
    () => filtrarPorBusqueda(postsPorAutor, query),
    [postsPorAutor, query]
  );
  const secciones = useMemo(
    () => agruparPorCategoria(postsFiltrados, dateOrder),
    [postsFiltrados, dateOrder]
  );
  const hasFilters = filtrandoAutor || filtrandoCategoria || Boolean(query.trim());

  function scrollToCategory(sectionId, categoria) {
    setActiveCategory(categoria);
    document.querySelector('.blog-mobile-filters[open]')?.removeAttribute('open');
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <Root className={preview ? 'blog-index-preview' : undefined}>
      <section className="page-hero">
        <div className={filtrandoAutor && authorPhoto ? 'wrap blog-author-hero' : 'wrap'}>
          <div>
            <span className="eyebrow">Blog</span>
            <h1>
              {filtrandoAutor
                ? `Notas escritas por ${authorName}.`
                : filtrandoCategoria
                  ? `Notas sobre ${categoriaFiltro}.`
                  : 'Ideas para entender mejor lo publico.'}
            </h1>
            {filtrandoAutor ? (
              <div className="blog-author-about">
                <span>Sobre mi</span>
                <p className="lead">{authorLead}</p>
                {authorFocusArea && (
                  <div className="blog-author-focus">
                    <small>Temas y mirada</small>
                    <p>{authorFocusArea}</p>
                  </div>
                )}
              </div>
            ) : filtrandoCategoria ? (
              <p className="lead">Articulos publicados dentro de esta categoria.</p>
            ) : (
              <p className="lead">Investigacion, analisis y opinion sobre politica, instituciones y participacion ciudadana.</p>
            )}
            {filtrandoAutor && authorPhoto && (
              <div className="blog-author-mobile-card" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={authorPhoto} alt="" />
              </div>
            )}
            {filtrandoAutor || filtrandoCategoria ? (
              <Link href="/blog" className="btn btn-ghost blog-filter-clear">Ver todos</Link>
            ) : ''}
          </div>
          {filtrandoAutor && authorPhoto && (
            <aside className="blog-author-card" aria-label={`Perfil de ${authorName}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={authorPhoto} alt="" />
            </aside>
          )}
        </div>
      </section>

      <section className="sec blog-index-section">
        <div className="wrap">
          <div className="blog-search-panel blog-search-panel--desktop">
            <BlogSearchControls
              dateOrder={dateOrder}
              hasFilters={hasFilters}
              inputId="blog-search"
              postsCount={postsFiltrados.length}
              query={query}
              setDateOrder={setDateOrder}
              setQuery={setQuery}
            />
          </div>

          {postsPorAutor.length > 0 && (
            <details className="blog-mobile-filters">
              <summary>
                <span className="material-symbols-outlined" aria-hidden="true">tune</span>
                <strong>Buscar y filtrar</strong>
                <small>{postsFiltrados.length} {postsFiltrados.length === 1 ? 'nota' : 'notas'}</small>
                <span className="material-symbols-outlined blog-mobile-filters__arrow" aria-hidden="true">expand_more</span>
              </summary>
              <div className="blog-mobile-filters__content">
                <div className="blog-search-panel">
                  <BlogSearchControls
                    dateOrder={dateOrder}
                    hasFilters={hasFilters}
                    inputId="blog-search-mobile"
                    postsCount={postsFiltrados.length}
                    query={query}
                    setDateOrder={setDateOrder}
                    setQuery={setQuery}
                  />
                </div>
                {postsFiltrados.length > 0 && (
                  <aside className="blog-toc" aria-label="Categorías y autores del blog">
                    <BlogSidebarContent
                      activeCategory={activeCategory}
                      authors={authors}
                      idSuffix="-mobile"
                      onCategory={scrollToCategory}
                      secciones={secciones}
                      showAuthors={!filtrandoAutor}
                    />
                  </aside>
                )}
              </div>
            </details>
          )}

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
                          <PostCard
                            authorIsPublic={publicAuthorKeys.has(taxonomyKey(p.autor))}
                            key={p.id}
                            post={p}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>

              <aside className="blog-toc blog-toc--desktop" aria-label="Categorías del blog">
                <BlogSidebarContent
                  activeCategory={activeCategory}
                  authors={authors}
                  onCategory={scrollToCategory}
                  secciones={secciones}
                  showAuthors={!filtrandoAutor}
                />
              </aside>
            </div>
          )}
        </div>
      </section>

      {!preview && <section className="blog-newsletter" id="news">
        <div className="wrap blog-newsletter-inner">
          <div>
            <span className="eyebrow">Newsletter</span>
            <h2>Ideas y novedades, directo en tu correo.</h2>
            <p>Recibi nuevas notas y actualizaciones de Politeia. Primero te enviaremos un email para confirmar tu suscripcion.</p>
          </div>
          <NewsletterForm initialStatus={newsletterStatus} initialEmail={newsletterEmail} initialToken={newsletterToken} />
        </div>
      </section>}
    </Root>
  );
}

function filtrarPorAutor(posts, autor) {
  const key = taxonomyKey(autor);
  if (!key) return posts;
  return posts.filter((post) => taxonomyKey(post.autor) === key);
}

function filtrarPorCategoria(posts, categoria) {
  const key = taxonomyKey(categoria);
  if (!key) return posts;
  return posts.filter((post) => taxonomyKey(post.categoria) === key);
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

function agruparPorCategoria(posts, dateOrder = 'neutral') {
  const grupos = new Map();

  posts.forEach((post) => {
    const categoria = post.categoria || 'Notas';
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria).push(post);
  });

  const direction = dateOrder === 'oldest' ? 1 : -1;

  return Array.from(grupos, ([categoria, items]) => {
    const sortedPosts = [...items].sort((a, b) => (
      direction * (postTimestamp(a) - postTimestamp(b))
    ));
    return {
      categoria,
      posts: sortedPosts,
      referenceTimestamp: postTimestamp(sortedPosts[0]),
    };
  })
    .sort((a, b) => {
      if (dateOrder === 'neutral') {
        return b.referenceTimestamp - a.referenceTimestamp
          || a.categoria.localeCompare(b.categoria, 'es');
      }
      return direction * (a.referenceTimestamp - b.referenceTimestamp)
        || a.categoria.localeCompare(b.categoria, 'es');
    })
    .map(({ referenceTimestamp, ...group }) => group);
}

function postTimestamp(post = {}) {
  const value = post.fecha || post.publishedAt || post.publicationDate || post.createdAt;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
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
