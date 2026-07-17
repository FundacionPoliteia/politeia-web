'use client';

import { useMemo, useState } from 'react';
import { taxonomyKey } from '../lib/taxonomy';
import AuthorCard from './AuthorCard';

export default function AuthorsIndex({ authors = [] }) {
  const [query, setQuery] = useState('');
  const filteredAuthors = useMemo(() => {
    const key = taxonomyKey(query);
    if (!key) return authors;
    return authors.filter((author) => searchableAuthorText(author).includes(key));
  }, [authors, query]);

  return (
    <main>
      <section className="page-hero authors-hero">
        <div className="wrap">
          <span className="eyebrow">Autores</span>
          <h1>Conoce las voces que escriben en Politeia.</h1>
          <p className="lead">
            Miradas, recorridos y temas de quienes investigan, analizan y escriben para el blog.
          </p>
        </div>
      </section>

      <section className="sec authors-index-section">
        <div className="wrap">
          <div className="blog-search-panel">
            <label htmlFor="author-search">Buscar autores</label>
            <div className="blog-search-box">
              <span aria-hidden="true" className="material-symbols-outlined">search</span>
              <input
                id="author-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, mirada o categoria"
              />
              {query && (
                <button aria-label="Limpiar busqueda" onClick={() => setQuery('')} type="button">
                  <span aria-hidden="true" className="material-symbols-outlined">close</span>
                </button>
              )}
            </div>
            <p>
              {filteredAuthors.length} {filteredAuthors.length === 1 ? 'autor visible' : 'autores visibles'}.
            </p>
          </div>

          {filteredAuthors.length > 0 ? (
            <div className="authors-grid">
              {filteredAuthors.map((author) => (
                <AuthorCard author={author} key={author.authorSlug || author.fullName} />
              ))}
            </div>
          ) : (
            <div className="empty">No encontramos autores que coincidan con esa busqueda.</div>
          )}
        </div>
      </section>
    </main>
  );
}

function searchableAuthorText(author = {}) {
  return taxonomyKey([
    author.fullName,
    author.description,
    author.focusArea,
    ...(author.categories || []),
  ].filter(Boolean).join(' '));
}
