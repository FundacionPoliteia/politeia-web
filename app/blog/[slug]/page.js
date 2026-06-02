import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, getAllSlugs, formatearFecha } from '../../../lib/wordpress';

// Genera una página por cada nota existente
export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Permite que notas nuevas (que aún no existían al compilar) también funcionen
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  if (!post) return { title: 'Nota no encontrada — Politeia' };
  return { title: `${post.titulo} — Politeia` };
}

export default async function NotaPage({ params }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  return (
    <article className="article">
      <Link href="/blog" className="back">← Volver al blog</Link>
      <span className="art-cat">{post.categoria || 'Nota'}</span>
      <h1>{post.titulo}</h1>
      <div className="art-meta">
        {post.autor ? `Por ${post.autor} · ` : ''}{formatearFecha(post.fecha)}
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
