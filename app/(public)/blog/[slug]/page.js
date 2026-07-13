import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, formatearFecha, etiquetasPost, hrefAutorBlog } from '../../../../lib/blogApi';

export const dynamic = 'force-dynamic';

// Genera una pagina por cada nota existente.
// Permite que notas nuevas tambien funcionen si no existian al compilar.
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Nota no encontrada - Politeia' };

  const title = `${post.titulo} - Politeia`;
  const description = buildShareDescription(post.extracto || post.contenido);
  const url = `${siteUrl()}/blog/${post.slug || slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Politeia',
      type: 'article',
      publishedTime: post.fecha || undefined,
      authors: post.autor ? [post.autor] : undefined,
      tags: post.tags || undefined,
      images: post.imagen ? [{ url: post.imagen, alt: post.titulo }] : undefined,
    },
    twitter: {
      card: post.imagen ? 'summary_large_image' : 'summary',
      title,
      description,
      images: post.imagen ? [post.imagen] : undefined,
    },
  };
}

export default async function NotaPage({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const autorNombre = post.autorPerfil?.fullName || post.autor || '';
  const autorFoto = post.autorPerfil?.photoUrl || '';
  const cierreAutor = post.cierreAutor || post.autorPerfil?.description || '';

  return (
    <article className="article">
      <Link href="/blog" className="back">&larr; Volver al blog</Link>
      <div className="art-tags" aria-label="Tags">
        {etiquetasPost(post).slice(0, 4).map((tag) => (
          <span className="art-cat" key={tag}>{tag}</span>
        ))}
      </div>
      <h1>{post.titulo}</h1>
      <div className="art-meta">
        {post.autor && (
          <>
            Por <Link href={hrefAutorBlog(post.autor)} className="art-author">{post.autor}</Link>
            {' - '}
          </>
        )}
        {formatearFecha(post.fecha)}
      </div>
      {post.imagen && post.mostrarPortada !== false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="art-hero" src={post.imagen} alt={post.titulo} />
      )}
      <div
        className="art-body"
        dangerouslySetInnerHTML={{ __html: post.contenido }}
      />
      {(autorNombre || autorFoto || cierreAutor) && (
        <section className="art-author-end" aria-label="Autor de la nota">
          {autorFoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={autorFoto} alt="" />
          )}
          <div>
            <span>Escrito por</span>
            {autorNombre ? (
              <h2>
                <Link href={hrefAutorBlog(autorNombre)} className="art-author">{autorNombre}</Link>
              </h2>
            ) : null}
            {cierreAutor && <p>{cierreAutor}</p>}
          </div>
        </section>
      )}
    </article>
  );
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://politeia.ar').replace(/\/$/, '');
}

function buildShareDescription(value = '') {
  const plain = String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 'Investigacion, analisis y opinion de Politeia.';
  return plain.length > 170 ? `${plain.slice(0, 167).trim()}...` : plain;
}
