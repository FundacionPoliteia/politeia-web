import { createHash } from 'node:crypto';
import { config } from '../../config.js';
import { ApiError } from '../../errors.js';

const RESOURCE_URL = 'https://www.senado.gob.ar/micrositios/DatosAbiertos/ExportarListadoSenadores/json';
const ALLOWED_HOST = 'www.senado.gob.ar';
type RequestValidators = { etag?: string | null; lastModified?: string | null; forceDownload?: boolean };
export interface SenateDownload {
  resourceId: string; resourceUrl: string; sourceModifiedAt: string | null; payload: Buffer | null; sha256: string | null;
  notModified: boolean; etag: string | null; lastModified: string | null;
}

export async function downloadCurrentSenators(request: RequestValidators = {}): Promise<SenateDownload> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.congressFetchTimeoutMs);
  try {
    let url = new URL(RESOURCE_URL); let response: Response | null = null;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      assertAllowed(url);
      response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: {
        accept: 'application/json', 'user-agent': 'QuorumPoliteia/0.1 (quorum@politeia.ar)',
        ...(!request.forceDownload && request.etag ? { 'if-none-match': request.etag } : {}),
        ...(!request.forceDownload && request.lastModified ? { 'if-modified-since': request.lastModified } : {}),
      } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new ApiError(502, 'senate_redirect_error', 'El Senado devolvió una redirección inválida');
      await response.body?.cancel(); url = new URL(location, url);
    }
    if (response?.status === 304) return {
      resourceId: 'senadores-vigentes-json', resourceUrl: url.toString(), sourceModifiedAt: normalizeDateTime(response.headers.get('last-modified')),
      payload: null, sha256: null, notModified: true, etag: response.headers.get('etag') || request.etag || null,
      lastModified: response.headers.get('last-modified') || request.lastModified || null,
    };
    if (!response?.ok) throw new ApiError(502, 'senate_http_error', `El Senado respondió HTTP ${response?.status || 0}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > config.congressMaxDownloadBytes) throw new ApiError(422, 'official_source_too_large', 'La fuente oficial superó el tamaño máximo permitido');
    if (!response.body) throw new ApiError(502, 'official_source_empty', 'El Senado devolvió una respuesta vacía');
    const reader = response.body.getReader(); const chunks: Buffer[] = []; let received = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break; received += value.byteLength;
      if (received > config.congressMaxDownloadBytes) { await reader.cancel(); throw new ApiError(422, 'official_source_too_large', 'La fuente oficial superó el tamaño máximo permitido'); }
      chunks.push(Buffer.from(value));
    }
    if (!received) throw new ApiError(502, 'official_source_empty', 'El Senado devolvió una respuesta vacía');
    const payload = Buffer.concat(chunks);
    return {
      resourceId: 'senadores-vigentes-json', resourceUrl: url.toString(), sourceModifiedAt: normalizeDateTime(response.headers.get('last-modified')), payload,
      sha256: createHash('sha256').update(payload).digest('hex'), notModified: false, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError(504, 'official_source_timeout', 'El Senado demoró demasiado en responder');
    throw new ApiError(502, 'senate_source_unavailable', 'No pudimos consultar la fuente oficial del Senado');
  } finally { clearTimeout(timeout); }
}

function assertAllowed(url: URL) { if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== ALLOWED_HOST || url.username || url.password) throw new ApiError(422, 'official_source_url_blocked', 'La URL de la fuente del Senado no está permitida'); }
function normalizeDateTime(value: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date.toISOString(); }
