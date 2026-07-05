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
const IMAGENES_NO_EDITORIALES = [
  'politeia-logo',
  'cropped-frame',
  'unnamed-file',
  'capa_1',
  'frame-15',
];

const MARCADORES_FIN_ARTICULO = [
  '¿Querés estar todavía',
  'Querés estar todavía',
  'mas cerca de la política',
  'más cerca de la política',
  'Jóvenes que buscamos fortalecer',
  'Politeia ©',
  'Política de privacidad',
];

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

function limpiarUrl(url = '') {
  const limpia = url
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .trim();

  if (limpia.startsWith('//')) return `https:${limpia}`;
  if (limpia.startsWith('/')) return `https://politeia.ar${limpia}`;
  return limpia.replace(/^http:\/\/politeia\.ar/i, 'https://politeia.ar');
}

function esImagenEditorial(url = '') {
  const limpia = limpiarUrl(url).toLowerCase();
  if (!limpia || limpia.startsWith('data:')) return false;
  return !IMAGENES_NO_EDITORIALES.some((fragmento) => limpia.includes(fragmento));
}

function primeraImagenEnHtml(html = '') {
  const imagenes = html.match(/<img[^>]*>/gi) || [];

  for (const img of imagenes) {
    const attrs = {};
    for (const match of img.matchAll(/([\w-]+)=["']([^"']+)["']/g)) {
      attrs[match[1].toLowerCase()] = match[2];
    }

    const srcset = attrs['data-srcset'] || attrs.srcset;
    const srcsetUrl = srcset?.split(',').at(-1)?.trim().split(/\s+/)[0];
    const src = attrs['data-src'] || attrs['data-lazy-src'] || srcsetUrl || attrs.src;

    if (esImagenEditorial(src)) return limpiarUrl(src);
  }

  return null;
}

function imagenDestacada(media) {
  if (!media) return null;
  const sizes = media.media_details?.sizes || {};

  return (
    sizes.large?.source_url ||
    sizes.medium_large?.source_url ||
    sizes.full?.source_url ||
    media.source_url ||
    media.guid?.rendered ||
    null
  );
}

function obtenerImagen(p) {
  const media = p._embedded?.['wp:featuredmedia']?.[0];
  const destacada = imagenDestacada(media);
  if (esImagenEditorial(destacada)) return limpiarUrl(destacada);

  return (
    primeraImagenEnHtml(p.content?.rendered) ||
    primeraImagenEnHtml(p.excerpt?.rendered) ||
    null
  );
}

function cortarContenidoEditorial(html = '') {
  let contenido = html;

  for (const marcador of MARCADORES_FIN_ARTICULO) {
    const idx = contenido.toLowerCase().indexOf(marcador.toLowerCase());
    if (idx !== -1) contenido = contenido.slice(0, idx);
  }

  return contenido;
}

function extraerWidgetsTexto(html = '') {
  const widgets = [];
  const re = /<div[^>]+data-widget_type=["']text-editor\.default["'][\s\S]*?<div class=["']elementor-widget-container["']>([\s\S]*?)<\/div>\s*<\/div>/gi;

  for (const match of html.matchAll(re)) {
    const contenido = match[1]?.trim();
    if (contenido) widgets.push(contenido);
  }

  return widgets;
}

function limpiarContenido(html = '') {
  const cortado = cortarContenidoEditorial(html);
  const widgetsTexto = extraerWidgetsTexto(cortado);

  if (widgetsTexto.length) {
    return widgetsTexto.join('\n');
  }

  return cortado;
}

function extraerAutor(html = '') {
  const match = html.match(/<p[^>]*>\s*(?:<strong>)?\s*Por\s+([^<.]+)\.?/i);
  return match?.[1]?.trim() || '';
}

function obtenerCategoria(p) {
  try {
    const categoria = p._embedded['wp:term'][0][0].name || '';
    return categoria.toLowerCase() === 'uncategorized' ? '' : categoria;
  } catch (e) {
    return '';
  }
}

// Da forma a una nota cruda de WordPress -> objeto simple para la web
function normalizarPost(p) {
  let autor = '';
  try {
    autor = p._embedded.author[0].name || '';
  } catch (e) {}

  const contenido = limpiarContenido(p.content?.rendered || '');
  autor = autor || extraerAutor(contenido);

  return {
    id: p.id,
    slug: p.slug,
    titulo: limpiarTexto(p.title?.rendered),
    extracto: limpiarTexto(p.excerpt?.rendered).slice(0, 160),
    contenido,
    fecha: p.date,
    imagen: obtenerImagen(p),
    autor,
    categoria: obtenerCategoria(p),
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
