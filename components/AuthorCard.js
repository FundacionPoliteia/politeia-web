import Link from 'next/link';

const DEFAULT_PROFILE_PHOTO = '/default_profile.png';

export default function AuthorCard({ author = {}, preview = false, featured = false }) {
  const fullName = author.fullName || 'Tu nombre';
  const description = author.description || 'Tu presentacion personal aparecera aca para que los lectores conozcan tu recorrido y tu mirada.';
  const focusArea = author.focusArea || 'Temas y areas de interes';
  const postCount = Number(author.postCount) || 0;

  return (
    <article className={`author-card ${featured ? 'featured' : ''} ${preview ? 'is-preview' : ''}`}>
      <div className="author-card-photo">
        <span aria-hidden="true">Voces de Politeia</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={author.photoUrl || DEFAULT_PROFILE_PHOTO} alt="" />
      </div>
      <div className="author-card-body">
        <h2>{fullName}</h2>
        <section className="author-card-about" aria-label={`Sobre ${fullName}`}>
          <span>Sobre mi</span>
          <p>{description}</p>
        </section>
        <div className="author-card-focus">
          <span>Sobre que escribo</span>
          <strong>{focusArea}</strong>
        </div>
        <div className="author-card-meta">
          <strong>{postCount} {postCount === 1 ? 'nota publicada' : 'notas publicadas'}</strong>
          {author.latestPostTitle && (
            <small>
              Ultima nota:{' '}
              {author.latestPostSlug && !preview ? (
                <Link href={`/blog/${author.latestPostSlug}`}>{author.latestPostTitle}</Link>
              ) : author.latestPostTitle}
            </small>
          )}
        </div>
        {author.categories?.length > 0 && (
          <div className="author-card-tags" aria-label="Categorias principales">
            {author.categories.slice(0, 3).map((category) => (
              <em key={category}>{category}</em>
            ))}
          </div>
        )}
        {preview ? (
          <span className="btn btn-ghost author-card-action">Ver sus notas</span>
        ) : (
          <Link href={`/blog?autor=${encodeURIComponent(fullName)}`} className="btn btn-ghost author-card-action">
            Ver sus notas
          </Link>
        )}
      </div>
    </article>
  );
}
