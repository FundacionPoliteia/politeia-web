import Link from 'next/link';

const DEFAULT_PROFILE_PHOTO = '/default_profile.png';

export default function AuthorCard({ author = {}, preview = false, featured = false }) {
  const fullName = author.fullName || 'Tu nombre';
  const aboutMe = author.focusArea || 'Conta brevemente quien sos, que mirada aportas y que te interesa compartir con los lectores.';
  const postCount = Number(author.postCount) || 0;

  return (
    <article className={`author-card ${featured ? 'featured' : ''} ${preview ? 'is-preview' : ''}`}>
      <div className="author-card-photo">
        <span aria-hidden="true">Voces de Politeia</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={author.photoUrl || DEFAULT_PROFILE_PHOTO} alt="" />
        <h2>{fullName}</h2>
      </div>
      <div className="author-card-body">
        <section className="author-card-about" aria-label={`Sobre ${fullName}`}>
          <h3>Sobre mi</h3>
          <p>{aboutMe}</p>
        </section>
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
              <Link href={`/blog?categoria=${encodeURIComponent(category)}`} key={category}>
                {category}
              </Link>
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
