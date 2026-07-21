import Link from 'next/link';

const DEFAULT_PROFILE_PHOTO = '/default_profile.png';

export default function AuthorEnd({ fullName = '', photoUrl = '', closingPhrase = '', preview = false }) {
  if (!fullName && !closingPhrase) return null;

  const name = fullName || 'Autor de Politeia';
  const content = (
    <>
      <span>Sobre el autor</span>
      <h2>
        {preview ? name : (
          <Link href={`/blog?autor=${encodeURIComponent(name)}`} className="art-author">
            {name}
          </Link>
        )}
      </h2>
      {closingPhrase && <p>{closingPhrase}</p>}
    </>
  );

  return (
    <section className="art-author-end" aria-label="Autor de la nota">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl || DEFAULT_PROFILE_PHOTO} alt="" />
      <div>{content}</div>
    </section>
  );
}
