// ============================================================
//  Conexión con WordPress (DigitalOcean) — politeia.ar
//  Estas funciones corren en el SERVIDOR de Next.js, por eso
//  no tienen el problema de CORS del navegador.
//  Si algún día cambia la dirección del WordPress, se cambia
//  SOLO acá, en la constante API_BASE.
// ============================================================

const API_BASE = 'https://politeia.ar/wp-json/wp/v2';

// Cada cuánto Next.js vuelve a pedir las notas frescas (segundos).
// 300 = 5 minutos. Una nota nueva aparece como mucho 5 min después.
const REVALIDAR = 300;

// Quita etiquetas HTML de un texto (WordPress devuelve títulos con <b>, etc.)
function limpiarTexto(html = '') {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/&#8230;/g, '\u2026')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Da forma a una nota cruda de WordPress -> objeto simple para la web
function normalizarPost(p) {
  let imagen = null;
  try {
    imagen = p._embedded['wp:featuredmedia'][0].source_url || null;
  } catch (e) {}

  let autor = '';
  try {
    autor = p._embedded.author[0].name || '';
  } catch (e) {}

  let categoria = '';
  try {
    categoria = p._embedded['wp:term'][0][0].name || '';
  } catch (e) {}

  return {
    id: p.id,
    slug: p.slug,
    titulo: limpiarTexto(p.title?.rendered),
    extracto: limpiarTexto(p.excerpt?.rendered).slice(0, 160),
    contenido: p.content?.rendered || '',
    fecha: p.date,
    imagen,
    autor,
    categoria,
    linkOriginal: p.link,
  };
}

// Trae las últimas N notas (para el blog y el carrusel)
export async function getPosts(cantidad = 12) {
  try {
    const res = await fetch(
      `${API_BASE}/posts?per_page=${cantidad}&_embed`,
      { next: { revalidate: REVALIDAR } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(normalizarPost);
  } catch (e) {
    return [];
  }
}

// Trae UNA nota por su "slug" (la parte final de la dirección)
export async function getPost(slug) {
  try {
    const res = await fetch(
      `${API_BASE}/posts?slug=${slug}&_embed`,
      { next: { revalidate: REVALIDAR } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return normalizarPost(data[0]);
  } catch (e) {
    return null;
  }
}

// Devuelve la lista de slugs (para que Next genere cada página de nota)
export async function getAllSlugs() {
  try {
    const res = await fetch(
      `${API_BASE}/posts?per_page=100&_fields=slug`,
      { next: { revalidate: REVALIDAR } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((p) => p.slug);
  } catch (e) {
    return [];
  }
}

// Formatea una fecha ISO a algo legible en español
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
