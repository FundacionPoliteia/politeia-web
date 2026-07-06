import BlogIndex from '../../../components/BlogIndex';
import { getPosts } from '../../../lib/blogApi';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Blog - Politeia' };

export default async function BlogPage({ searchParams }) {
  const params = await searchParams;
  const autorFiltro = normalizarParametro(params?.autor);
  const posts = await getPosts(30);

  return <BlogIndex posts={posts} autorFiltro={autorFiltro} />;
}

function normalizarParametro(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}
