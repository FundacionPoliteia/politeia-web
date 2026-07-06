import { sanitizeTags } from './taxonomy';

const API_BASE = process.env.BLOG_API_BASE_URL || '';

function normalizarPost(p) {
  return {
    id: p.id,
    slug: p.slug,
    titulo: p.title || '',
    extracto: p.excerpt || '',
    contenido: p.contentHtml || '',
    fecha: p.publishedAt || p.createdAt || p.updatedAt,
    imagen: p.coverImage || null,
    mostrarPortada: p.showCoverInPost !== false,
    autor: p.authorName || '',
    categoria: p.category || '',
    tags: sanitizeTags(p.tags),
  };
}

async function fetchApi(path) {
  if (!API_BASE) return null;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

export async function getPosts(cantidad = 12) {
  const data = await fetchApi(`/v1/posts?status=published&limit=${cantidad}`);
  return (data?.items || []).map(normalizarPost);
}

export async function getPost(slug) {
  const data = await fetchApi(`/v1/posts/${encodeURIComponent(slug)}`);
  return data?.item ? normalizarPost(data.item) : null;
}

export async function getAllSlugs() {
  const data = await fetchApi('/v1/posts?status=published&limit=50');
  return (data?.items || []).map((p) => p.slug).filter(Boolean);
}

export function etiquetasPost(post, fallback = 'Nota') {
  const tags = sanitizeTags(post?.tags);
  return tags.length ? tags : [fallback];
}

export function hrefAutorBlog(autor) {
  return `/blog?autor=${encodeURIComponent(autor || '')}`;
}

export function formatearFecha(iso) {
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
