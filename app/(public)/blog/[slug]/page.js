import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, formatearFecha, etiquetasPost, hrefAutorBlog } from '../../../../lib/blogApi';

export const dynamic = 'force-dynamic';

// Genera una página por cada nota existente
// Permite que notas nuevas (que aún no existían al compilar) también funcionen
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Nota no encontrada — Politeia' };
  return { title: `${post.titulo} — Politeia` };
}

export default async function NotaPage({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <article className="article">
      <Link href="/blog" className="back">← Volver al blog</Link>
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
      {post.imagen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="art-hero" src={post.imagen} alt={post.titulo} />
      )}
      <div
        className="art-body"
        dangerouslySetInnerHTML={{ __html: post.contenido }}
      />
    </article>
  );
}
