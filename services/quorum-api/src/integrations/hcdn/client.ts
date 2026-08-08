import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { ApiError } from '../../errors.js';

const ALLOWED_HOSTS = new Set(['datos.hcdn.gob.ar']);
const METADATA_URL = 'https://datos.hcdn.gob.ar/api/3/action/package_show?id=legisladores';
const resourceSchema = z.object({ id: z.string().min(1), name: z.string().default(''), format: z.string().default(''), mimetype: z.string().nullable().optional(), url: z.string().url(), last_modified: z.string().nullable().optional() });
const packageSchema = z.object({ success: z.literal(true), result: z.object({ resources: z.array(resourceSchema) }) });

type RequestValidators = { etag?: string | null; lastModified?: string | null; forceDownload?: boolean };
type FetchResult = { payload: Buffer | null; notModified: boolean; etag: string | null; lastModified: string | null };
export interface HcdnDownload {
  resourceId: string; resourceUrl: string; sourceModifiedAt: string | null; payload: Buffer | null; sha256: string | null;
  notModified: boolean; etag: string | null; lastModified: string | null;
}

export async function downloadCurrentDeputies(request: RequestValidators = {}): Promise<HcdnDownload> {
  const metadataResponse = await fetchBuffer(METADATA_URL, 2 * 1024 * 1024);
  const metadata = packageSchema.parse(JSON.parse(metadataResponse.payload!.toString('utf8')));
  const resource = metadata.result.resources.find((item) => item.format.toUpperCase() === 'JSON' && normalize(item.name).includes('composicion actual'));
  if (!resource) throw new ApiError(502, 'hcdn_resource_missing', 'Diputados no informó un recurso JSON de composición actual');
  const result = await fetchBuffer(resource.url, config.congressMaxDownloadBytes, request.forceDownload ? {} : request);
  if (result.notModified) return {
    resourceId: resource.id, resourceUrl: resource.url, sourceModifiedAt: normalizeDateTime(resource.last_modified), payload: null, sha256: null,
    notModified: true, etag: result.etag || request.etag || null, lastModified: result.lastModified || request.lastModified || null,
  };
  const payload = result.payload!;
  return {
    resourceId: resource.id, resourceUrl: resource.url, sourceModifiedAt: normalizeDateTime(resource.last_modified), payload,
    sha256: createHash('sha256').update(payload).digest('hex'), notModified: false, etag: result.etag, lastModified: result.lastModified,
  };
}

async function fetchBuffer(value: string, limit: number, validators: RequestValidators = {}): Promise<FetchResult> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.congressFetchTimeoutMs);
  try {
    let url = allowedUrl(value); let response: Response | null = null;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: {
        accept: 'application/json,text/plain;q=0.9', 'user-agent': 'QuorumPoliteia/0.1 (quorum@politeia.ar)',
        ...(validators.etag ? { 'if-none-match': validators.etag } : {}),
        ...(validators.lastModified ? { 'if-modified-since': validators.lastModified } : {}),
      } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new ApiError(502, 'official_source_redirect_error', 'La fuente oficial devolvió una redirección inválida');
      await response.body?.cancel(); url = allowedUrl(new URL(location, url).toString());
    }
    if (!response) throw new ApiError(502, 'official_source_empty', 'La fuente oficial no respondió');
    if (response.status === 304) return { payload: null, notModified: true, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
    if (!response.ok) throw new ApiError(502, 'official_source_http_error', `La fuente oficial respondió HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > limit) throw new ApiError(422, 'official_source_too_large', 'La fuente oficial superó el tamaño máximo permitido');
    if (!response.body) throw new ApiError(502, 'official_source_empty', 'La fuente oficial devolvió una respuesta vacía');
    const reader = response.body.getReader(); const chunks: Buffer[] = []; let received = 0;
    while (true) {
      const { done, value: chunk } = await reader.read(); if (done) break; received += chunk.byteLength;
      if (received > limit) { await reader.cancel(); throw new ApiError(422, 'official_source_too_large', 'La fuente oficial superó el tamaño máximo permitido'); }
      chunks.push(Buffer.from(chunk));
    }
    if (!received) throw new ApiError(502, 'official_source_empty', 'La fuente oficial devolvió una respuesta vacía');
    return { payload: Buffer.concat(chunks), notModified: false, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError(504, 'official_source_timeout', 'La fuente oficial demoró demasiado en responder');
    throw new ApiError(502, 'official_source_unavailable', 'No pudimos consultar la fuente oficial');
  } finally { clearTimeout(timeout); }
}

function allowedUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) throw new ApiError(422, 'official_source_url_blocked', 'La URL de la fuente no está permitida');
  return url;
}
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function normalizeDateTime(value?: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date.toISOString(); }
