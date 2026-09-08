import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { load } from 'cheerio';
import { emptyVoteCounts, voteChoices, votingResultSchema, votingOverrides, type VotingResult } from '@politeia/quorum-contracts';
import { ApiError } from '../errors.js';
import { store, newId } from '../store.js';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalized = (value: string) => clean(value).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
const choices: Record<string, typeof voteChoices[number]> = { AFIRMATIVO: 'yes', NEGATIVO: 'no', ABSTENCION: 'abstention', AUSENTE: 'absent', 'SIN VOTAR': 'notVoting', 'NO VOTO': 'notVoting', PRESIDENTE: 'notVoting' };
const headings: Record<string, typeof voteChoices[number]> = { AFIRMATIVOS: 'yes', NEGATIVOS: 'no', ABSTENCIONES: 'abstention', AUSENTES: 'absent', 'SIN VOTAR': 'notVoting' };
const invalid = () => new ApiError(422, 'voting_structure_changed', 'El acta no tiene un formato nominal compatible o sus totales no coinciden. No se importó nada; podés cargarla manualmente.');

export function officialVotingUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new ApiError(422, 'voting_url_invalid', 'Ingresá el enlace de un acta oficial de Diputados o Senado'); }
  const senate = ['www.senado.gob.ar', 'www.senado.gov.ar'].includes(url.hostname);
  const deputies = ['votaciones.diputados.gov.ar', 'votaciones.hcdn.gob.ar'].includes(url.hostname);
  const path = senate ? /^\/votaciones\/detalleActa\/(\d+)\/?$/ : /^\/votacion\/(\d+)\/?$/;
  const match = url.pathname.match(path);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash || (!senate && !deputies) || !match) throw new ApiError(422, 'voting_url_invalid', 'Usá un enlace HTTPS directo al acta oficial, sin parámetros');
  return { chamber: senate ? 'senate' as const : 'deputies' as const, url: `https://${senate ? 'www.senado.gob.ar/votaciones/detalleActa' : 'votaciones.diputados.gov.ar/votacion'}/${match[1]}` };
}

export function parseOfficialVoting(html: string, sourceUrl: string): VotingResult {
  const source = officialVotingUrl(sourceUrl);
  const $ = load(html);
  $('script, style, noscript').remove();
  const table = $(source.chamber === 'senate' ? '#tabla' : '#myTable');
  if (table.length !== 1 || !normalized(table.find('thead').text()).includes('COMO VOTO')) throw invalid();
  const dateMatch = $(source.chamber === 'senate' ? '.tab-content span' : 'h5').map((_, el) => $(el).text()).get().join(' ').match(/\b(\d{2})\/(\d{2})\/(\d{4})\s*-\s*\d{2}:\d{2}/);
  const acta = $('p').filter((_, el) => /^Acta Nro:/.test(clean($(el).text()))).first();
  const subject = clean(source.chamber === 'senate' ? acta.next('p').text() : $('h4.black-opacity').first().clone().children().remove().end().text());
  const outcomeNode = $(source.chamber === 'senate' ? '.tab-content p' : 'h3').filter((_, el) => ['AFIRMATIVO', 'NEGATIVO'].includes(normalized($(el).text()))).first();
  const outcome = normalized(outcomeNode.text());
  if (!dateMatch || !subject || !outcome) throw invalid();
  const counts = emptyVoteCounts(); const seen = new Set<string>();
  $('.row-in h4').each((_, el) => {
    const key = headings[normalized($(el).text())];
    if (!key) return;
    const amount = clean($(el).parent().find('h3').text());
    if (!/^\d+$/.test(amount) || seen.has(key)) throw invalid();
    counts[key] = Number(amount); seen.add(key);
  });
  if (!['yes', 'no', 'abstention', 'absent'].every(key => seen.has(key))) throw invalid();
  const nominal: VotingResult['nominal'] = [];
  const blocks = new Map<string, ReturnType<typeof emptyVoteCounts>>();
  table.find('tbody tr').each((_, row) => {
    const cells = $(row).children('td');
    const name = clean(cells.eq(1).text()); const bloc = clean(cells.eq(2).text()); const district = clean(cells.eq(3).text());
    const choice = choices[normalized(cells.eq(4).text())];
    if (!name || !choice || cells.length < 5) throw invalid();
    // Historical source identity, never an assumed link to a current editorial profile.
    nominal.push({ legislatorId: `official-${source.chamber}-${hash(`${normalized(name)}|${normalized(district)}`).slice(0, 24)}`, name, bloc, choice });
    if (bloc) { const total = blocks.get(bloc) || emptyVoteCounts(); total[choice]++; blocks.set(bloc, total); }
  });
  if (!nominal.length || voteChoices.some(key => nominal.filter(n => n.choice === key).length !== counts[key])) throw invalid();
  const majorityRule = clean(source.chamber === 'senate'
    ? $('.tab-content span').filter((_, el) => /\d{2}\/\d{2}\/\d{4}/.test($(el).text())).first().nextAll('span').first().text()
    : outcomeNode.parent().find('h5').first().text());
  const parsed = votingResultSchema.safeParse({ id: `official-${hash(source.url).slice(0, 24)}`, chamber: source.chamber, date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`, subject, type: 'unspecified', method: 'nominal', outcome: outcome === 'AFIRMATIVO' ? 'approved' : 'rejected', counts, blocks: [...blocks].map(([name, counts]) => ({ name, counts })), nominal, sourceUrl: source.url, notes: '', majorityRule });
  if (!parsed.success) throw invalid();
  return parsed.data;
}

type Snapshot = { id: string; sourceUrl: string; sha256: string; original: VotingResult; rawHtmlGzipBase64: string; parserVersion: number };
type Source = { id: string; snapshotId: string; checkedAt: string };
const inFlight = new Map<string, Promise<{ item: VotingResult; checkedAt: string; cached: boolean }>>();

export async function getVotingOriginal(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ApiError(422, 'voting_snapshot_invalid', 'Snapshot inválido');
  const snapshot = await store().get<Snapshot>('votingSnapshots', id);
  if (!snapshot) throw new ApiError(422, 'voting_snapshot_missing', 'No existe el original de esta votación; importá el acta nuevamente');
  return snapshot;
}

function withProvenance(item: VotingResult, snapshot: Snapshot): VotingResult {
  return { ...item, official: { snapshotId: snapshot.id, sourceUrl: snapshot.sourceUrl, sha256: snapshot.sha256, overriddenFields: votingOverrides(item, snapshot.original) } };
}

export async function validateVotingProvenance(votes: VotingResult[] = []) {
  if (new Set(votes.map(v => v.id)).size !== votes.length) throw new ApiError(422, 'voting_duplicate', 'No repitas una votación en el proyecto');
  const canonical = await Promise.all(votes.map(async vote => vote.official ? withProvenance(vote, await getVotingOriginal(vote.official.snapshotId)) : vote));
  const sources = canonical.flatMap(vote => vote.official ? [vote.official.sourceUrl] : []);
  if (new Set(sources).size !== sources.length) throw new ApiError(422, 'voting_duplicate', 'Esta acta oficial ya está incorporada al proyecto');
  return canonical;
}

export async function importOfficialVoting(input: string, actor: string) {
  const { url } = officialVotingUrl(input);
  const pending = inFlight.get(url); if (pending) return pending;
  const task = importActa(url, actor); inFlight.set(url, task);
  try { return await task; } finally { inFlight.delete(url); }
}

async function importActa(url: string, actor: string) {
  const sourceId = hash(url);
  const source = await store().get<Source>('votingSources', sourceId);
  if (source && Date.now() - Date.parse(source.checkedAt) < 30 * 60_000) {
    const snapshot = await getVotingOriginal(source.snapshotId);
    return { item: withProvenance(snapshot.original, snapshot), checkedAt: source.checkedAt, cached: true };
  }
  let payload: Buffer;
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { accept: 'text/html', 'user-agent': 'QuorumPoliteia/0.1' } });
    if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Respuesta inválida');
    const reader = response.body.getReader(); const chunks: Buffer[] = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length; if (length > 3_000_000) throw new Error('Acta demasiado grande');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    payload = Buffer.concat(chunks);
  } catch { throw new ApiError(502, 'voting_source_unavailable', 'No se pudo descargar el acta oficial. Tus datos guardados no cambiaron. Reintentá o continuá con carga manual.'); }
  const original = parseOfficialVoting(payload.toString('utf8'), url);
  const raw = gzipSync(payload);
  if (raw.length > 400_000) throw invalid();
  const sha256 = hash(payload); const id = hash(`v1|${url}|${sha256}`);
  // Content-addressed and deterministic: repeating a download cannot rewrite its original.
  const snapshot: Snapshot = { id, sourceUrl: url, sha256, original, rawHtmlGzipBase64: raw.toString('base64'), parserVersion: 1 };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 900_000) throw invalid();
  await store().set('votingSnapshots', id, snapshot);
  const checkedAt = new Date().toISOString();
  await store().set('votingSources', sourceId, { id: sourceId, snapshotId: id, checkedAt });
  const auditId = newId('audit');
  await store().set('audits', auditId, { id: auditId, action: 'voting.imported', actorEmail: actor, createdAt: checkedAt, entityId: id, details: { sourceUrl: url, sha256 } });
  return { item: withProvenance(original, snapshot), checkedAt, cached: false };
}
