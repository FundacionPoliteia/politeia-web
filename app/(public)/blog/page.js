import BlogIndex from '../../../components/BlogIndex';
import { getPosts, getPublicAuthorProfile, getPublicAuthorProfiles } from '../../../lib/blogApi';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Blog - Politeia' };

export default async function BlogPage({ searchParams }) {
  const params = await searchParams;
  const autorFiltro = normalizarParametro(params?.autor);
  const categoriaFiltro = normalizarParametro(params?.categoria);
  const newsletterStatus = normalizarParametro(params?.newsletter);
  const newsletterEmail = normalizarParametro(params?.email);
  const newsletterToken = normalizarParametro(params?.token);
  const [posts, authorProfile, authors] = await Promise.all([
    getPosts(30),
    autorFiltro ? getPublicAuthorProfile(autorFiltro) : null,
    getPublicAuthorProfiles(8),
  ]);

  return (
    <BlogIndex
      posts={posts}
      autorFiltro={autorFiltro}
      categoriaFiltro={categoriaFiltro}
      newsletterStatus={newsletterStatus}
      newsletterEmail={newsletterEmail}
      newsletterToken={newsletterToken}
      authorProfile={authorProfile}
      authors={authors}
    />
  );
}

function normalizarParametro(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}
