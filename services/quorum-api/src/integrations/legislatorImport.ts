import { z } from 'zod';
import {
  externalEntityLinkSchema, fieldProvenanceSchema, legislatorImportFieldSchema, legislatorSchema, slugify,
  type ExternalEntityLink, type ExternalLegislatorRecord, type ExternalSource, type Legislator,
} from '@politeia/quorum-contracts';
import { ApiError, notFound } from '../errors.js';
import { cachedList, cacheTtl } from '../dataCache.js';
import { newId, store } from '../store.js';
import { ensureSourceRegistry, HCDN_LEGISLATORS_SOURCE_ID, SENATE_LEGISLATORS_SOURCE_ID } from './registry.js';

const importInputSchema = z.object({
  sourceId: z.string().min(1).default(HCDN_LEGISLATORS_SOURCE_ID),
  externalId: z.string().min(2),
  localLegislatorId: z.string().min(1).nullable().optional(),
  createNew: z.boolean().default(false),
  fields: z.array(legislatorImportFieldSchema).min(1).default(['fullName', 'district', 'bloc', 'mandateStart', 'mandateEnd']),
});

const bulkImportInputSchema = z.object({ sourceId: z.string().min(1).default(HCDN_LEGISLATORS_SOURCE_ID), snapshotId: z.string().min(1) });
const bulkAllInputSchema = z.object({ snapshots: z.array(z.object({ sourceId: z.string().min(1), snapshotId: z.string().min(1) })).min(1) });
const baseBulkFields = ['fullName', 'district', 'bloc', 'mandateStart', 'mandateEnd'] as const;

export async function searchExternalLegislators(query: string) {
  const sources = (await ensureSourceRegistry()).filter((item) => item.enabled);
  if (!sources.length) throw new ApiError(503, 'integration_disabled', 'Las integraciones de legisladores están desactivadas');
  const cleanQuery = normalize(query);
  if (cleanQuery.length < 2) throw new ApiError(422, 'search_too_short', 'Ingresá al menos dos caracteres');
  if (!sources.some((item) => item.lastSnapshotId)) return { items: [], sources };
  const [records, links, locals] = await Promise.all([
    cachedList<ExternalLegislatorRecord>(store(), 'externalLegislators', cacheTtl.externalSnapshot),
    cachedList<ExternalEntityLink>(store(), 'externalEntityLinks', cacheTtl.referenceData),
    cachedList<Legislator>(store(), 'legislators', cacheTtl.referenceData),
  ]);
  const items = records
    .filter((item) => sources.some((source) => item.sourceId === source.id && item.snapshotId === source.lastSnapshotId))
    .filter((item) => normalize(`${item.fullName} ${item.district} ${item.currentBloc} ${item.externalId}`).includes(cleanQuery))
    .slice(0, 25)
    .map((record) => ({
      record,
      link: links.find((item) => item.sourceId === record.sourceId && item.externalId === record.externalId) || null,
      possibleMatches: locals.filter((item) => normalize(item.fullName) === normalize(record.fullName) || (normalize(item.fullName).includes(cleanQuery) && normalize(item.district) === normalize(record.district))).map(summary),
    }));
  return { items, sources };
}

export async function importExternalLegislator(input: unknown, actorEmail: string) {
  const parsed = importInputSchema.parse(input);
  const source = await activeSource(parsed.sourceId);
  if (source.mode === 'shadow') throw new ApiError(409, 'integration_shadow_mode', 'La fuente está en observación. Cambiala a modo asistido después de completar la validación de staging');
  if (!source.lastSnapshotId) throw new ApiError(409, 'source_not_synced', `Sincronizá ${source.label} antes de importar perfiles`);
  const record = (await store().list<ExternalLegislatorRecord>('externalLegislators')).find((item) => item.sourceId === source.id && item.snapshotId === source.lastSnapshotId && item.externalId.toLowerCase() === parsed.externalId.toLowerCase());
  if (!record) throw notFound('Registro oficial vigente');
  const links = await store().list<ExternalEntityLink>('externalEntityLinks');
  const existingLink = links.find((item) => item.sourceId === source.id && item.externalId === record.externalId);
  if (existingLink && parsed.localLegislatorId && parsed.localLegislatorId !== existingLink.localEntityId) throw new ApiError(409, 'external_identity_already_linked', 'Este identificador oficial ya está vinculado a otro perfil');

  const locals = await store().list<Legislator>('legislators');
  const targetId = existingLink?.localEntityId || parsed.localLegislatorId || null;
  const existing = targetId ? locals.find((item) => item.id === targetId) : null;
  if (targetId && !existing) throw notFound('Perfil local');
  if (existing?.published) throw new ApiError(409, 'published_legislator_requires_draft', 'El perfil vinculado ya es público. Esta primera fase sólo importa sobre perfiles privados para evitar cambios públicos automáticos');
  if (!existing && !parsed.fields.includes('fullName')) throw new ApiError(422, 'external_name_required', 'Para crear un perfil nuevo tenés que importar el nombre oficial');
  const candidates = locals.filter((item) => normalize(item.fullName) === normalize(record.fullName) && normalize(item.district) === normalize(record.district));
  if (!existing && candidates.length && !parsed.createNew) {
    throw new ApiError(409, 'external_match_review_required', 'Ya existe un perfil local parecido. Elegí vincularlo o confirmá la creación de uno nuevo', { candidates: candidates.map(summary) });
  }

  const localId = existing?.id || deterministicLegislatorId(source.id, record.externalId);
  const base: Omit<Legislator, 'id' | 'updatedAt'> = existing ? stripLegislatorMeta(existing) : {
    slug: uniqueSlug(record.fullName, record.externalId, locals), fullName: record.fullName, party: '', bloc: '', district: '', office: officeForSource(source.id),
    mandateStart: null, mandateEnd: null, academicTitle: '', bio: '', attendance: null, published: false,
  };
  const next = { ...base };
  for (const field of parsed.fields) applyField(next, field, record);
  const item = legislatorSchema.parse({ ...next, id: localId, updatedAt: new Date().toISOString() });
  await store().set('legislators', item.id, item);
  const timestamp = new Date().toISOString();
  const link = externalEntityLinkSchema.parse({
    id: `${source.id}:${record.externalId.toLowerCase()}`, localEntityType: 'legislator', localEntityId: item.id, sourceId: source.id,
    externalId: record.externalId, officialUrl: record.officialUrl, confidence: existing ? 'reviewed' : 'exact', linkedAt: existingLink?.linkedAt || timestamp,
    linkedBy: actorEmail, lastImportedSnapshotId: record.snapshotId,
  });
  await store().set('externalEntityLinks', link.id, link);
  for (const field of parsed.fields) {
    const provenance = fieldProvenanceSchema.parse({
      id: `${link.id}:${field}:${record.snapshotId}`, localEntityType: 'legislator', localEntityId: item.id, field, sourceId: source.id,
      externalRecordId: record.id, snapshotId: record.snapshotId, sourceUrl: record.officialUrl || source.datasetUrl,
      sourceValue: externalValue(record, field), appliedAt: timestamp, appliedBy: actorEmail,
    });
    await store().set('fieldProvenance', provenance.id, provenance);
  }
  const auditId = newId('audit');
  await store().set('audits', auditId, { id: auditId, type: existing ? 'legislator.external.updated' : 'legislator.external.created', actorEmail, targetId: item.id, details: { sourceId: source.id, externalId: record.externalId, snapshotId: record.snapshotId, fields: parsed.fields }, createdAt: timestamp });
  return { item, link, source, importedFields: parsed.fields };
}

export async function bulkImportExternalLegislators(input: unknown, actorEmail: string) {
  const parsed = bulkImportInputSchema.parse(input);
  const source = await activeSource(parsed.sourceId);
  if (source.mode === 'shadow') throw new ApiError(409, 'integration_shadow_mode', 'La importación masiva sólo está disponible en modo asistido');
  if (!source.lastSnapshotId) throw new ApiError(409, 'source_not_synced', `Sincronizá ${source.label} antes de importar perfiles`);
  if (parsed.snapshotId !== source.lastSnapshotId) throw new ApiError(409, 'source_snapshot_changed', 'El snapshot cambió desde que abriste la confirmación. Revisá la fuente antes de continuar');

  const [allRecords, links, locals] = await Promise.all([
    store().list<ExternalLegislatorRecord>('externalLegislators'),
    store().list<ExternalEntityLink>('externalEntityLinks'),
    store().list<Legislator>('legislators'),
  ]);
  const records = allRecords.filter((item) => item.sourceId === source.id && item.snapshotId === source.lastSnapshotId);
  if (!records.length) throw new ApiError(409, 'source_snapshot_empty', 'El último snapshot válido no contiene legisladores importables');

  const linksByExternalId = new Map(links.filter((item) => item.sourceId === source.id).map((item) => [item.externalId.toLowerCase(), item]));
  const localsById = new Map(locals.map((item) => [item.id, item]));
  const review: Array<{ externalId: string; fullName: string; reason: string }> = [];
  const plans: Array<{ record: ExternalLegislatorRecord; item: Legislator; created: boolean }> = [];
  let alreadyLinked = 0;

  for (const record of records) {
    const existingLink = linksByExternalId.get(record.externalId.toLowerCase());
    if (existingLink) {
      if (localsById.has(existingLink.localEntityId)) alreadyLinked += 1;
      else review.push({ externalId: record.externalId, fullName: record.fullName, reason: 'El vínculo existente apunta a un perfil que ya no existe' });
      continue;
    }
    const deterministicId = deterministicLegislatorId(source.id, record.externalId);
    const resumable = localsById.get(deterministicId);
    if (resumable) {
      if (resumable.published) review.push({ externalId: record.externalId, fullName: record.fullName, reason: 'El perfil determinístico ya está publicado y requiere revisión manual' });
      else plans.push({ record, item: resumable, created: false });
      continue;
    }
    const exactMatches = locals.filter((item) => normalize(item.fullName) === normalize(record.fullName) && normalize(item.district) === normalize(record.district));
    if (exactMatches.length) {
      review.push({ externalId: record.externalId, fullName: record.fullName, reason: `Hay ${exactMatches.length} perfil(es) local(es) coincidente(s) sin vínculo oficial` });
      continue;
    }
    const item = legislatorSchema.parse({
      id: deterministicId, slug: uniqueSlug(record.fullName, record.externalId, [...localsById.values()]), fullName: record.fullName,
      party: record.party, bloc: record.currentBloc, district: record.district, office: officeForSource(source.id), mandateStart: record.mandateStart,
      mandateEnd: record.mandateEnd, academicTitle: '', bio: '', attendance: null, published: false, updatedAt: new Date().toISOString(),
    });
    localsById.set(item.id, item);
    plans.push({ record, item, created: true });
  }

  let created = 0; let resumed = 0; let failed = 0;
  const failedExternalIds: string[] = [];
  await runInChunks(plans, 10, async ({ record, item, created: isNew }) => {
    try {
      await persistBulkProfile(source, record, item, actorEmail, isNew);
      if (isNew) created += 1; else resumed += 1;
    } catch {
      failed += 1;
      if (failedExternalIds.length < 20) failedExternalIds.push(record.externalId);
    }
  });
  const timestamp = new Date().toISOString();
  const auditId = newId('audit');
  const result = { snapshotId: source.lastSnapshotId, total: records.length, created, resumed, alreadyLinked, needsReview: review.length, failed, review: review.slice(0, 20), failedExternalIds };
  await store().set('audits', auditId, { id: auditId, type: 'legislators.external.bulk-imported', actorEmail, targetId: source.id, details: result, createdAt: timestamp });
  return result;
}

export async function bulkImportAllExternalLegislators(input: unknown, actorEmail: string) {
  const parsed = bulkAllInputSchema.parse(input);
  const sources = await ensureSourceRegistry();
  const enabled = sources.filter((source) => source.enabled);
  if (!enabled.length) throw new ApiError(503, 'integration_disabled', 'Las integraciones de legisladores están desactivadas');
  const supplied = new Map(parsed.snapshots.map((item) => [item.sourceId, item.snapshotId]));
  for (const source of enabled) {
    if (!source.lastSnapshotId || supplied.get(source.id) !== source.lastSnapshotId) {
      throw new ApiError(409, 'source_snapshot_changed', `El snapshot de ${source.label} cambió o no fue confirmado. Volvé a revisar antes de continuar`);
    }
  }
  const results = [];
  for (const source of enabled) results.push({ sourceId: source.id, label: source.label, ...(await bulkImportExternalLegislators({ sourceId: source.id, snapshotId: source.lastSnapshotId }, actorEmail)) });
  const totals = results.reduce((total, result) => ({
    total: total.total + result.total, created: total.created + result.created, resumed: total.resumed + result.resumed,
    alreadyLinked: total.alreadyLinked + result.alreadyLinked, needsReview: total.needsReview + result.needsReview, failed: total.failed + result.failed,
  }), { total: 0, created: 0, resumed: 0, alreadyLinked: 0, needsReview: 0, failed: 0 });
  return { sources: results, totals };
}

async function persistBulkProfile(source: ExternalSource, record: ExternalLegislatorRecord, item: Legislator, actorEmail: string, created: boolean) {
  const timestamp = new Date().toISOString();
  const link = externalEntityLinkSchema.parse({
    id: `${source.id}:${record.externalId.toLowerCase()}`, localEntityType: 'legislator', localEntityId: item.id, sourceId: source.id,
    externalId: record.externalId, officialUrl: record.officialUrl, confidence: 'exact', linkedAt: timestamp, linkedBy: actorEmail,
    lastImportedSnapshotId: record.snapshotId,
  });
  const fields = record.party ? [...baseBulkFields, 'party'] as const : baseBulkFields;
  const provenance = fields.map((field) => fieldProvenanceSchema.parse({
    id: `${link.id}:${field}:${record.snapshotId}`, localEntityType: 'legislator', localEntityId: item.id, field, sourceId: source.id,
    externalRecordId: record.id, snapshotId: record.snapshotId, sourceUrl: record.officialUrl || source.datasetUrl,
    sourceValue: externalValue(record, field), appliedAt: timestamp, appliedBy: actorEmail,
  }));
  const auditId = newId('audit');
  if (created) await store().set('legislators', item.id, item);
  await Promise.all(provenance.map((itemProvenance) => store().set('fieldProvenance', itemProvenance.id, itemProvenance)));
  await store().set('externalEntityLinks', link.id, link);
  await store().set('audits', auditId, { id: auditId, type: created ? 'legislator.external.bulk-created' : 'legislator.external.bulk-resumed', actorEmail, targetId: item.id, details: { sourceId: source.id, externalId: record.externalId, snapshotId: record.snapshotId, fields }, createdAt: timestamp });
}

async function activeSource(sourceId = HCDN_LEGISLATORS_SOURCE_ID) {
  const source = (await ensureSourceRegistry()).find((item) => item.id === sourceId) as ExternalSource | undefined;
  if (!source) throw notFound('Fuente oficial');
  if (!source.enabled) throw new ApiError(503, 'integration_disabled', `La integración ${source.label} está desactivada`);
  return source;
}

function applyField(target: Record<string, unknown>, field: z.infer<typeof legislatorImportFieldSchema>, record: ExternalLegislatorRecord) {
  if (field === 'fullName') target.fullName = record.fullName;
  if (field === 'district') target.district = record.district;
  if (field === 'party') target.party = record.party;
  if (field === 'bloc') target.bloc = record.currentBloc;
  if (field === 'mandateStart') target.mandateStart = record.mandateStart;
  if (field === 'mandateEnd') target.mandateEnd = record.mandateEnd;
}
function externalValue(record: ExternalLegislatorRecord, field: z.infer<typeof legislatorImportFieldSchema>) { return ({ fullName: record.fullName, district: record.district, party: record.party, bloc: record.currentBloc, mandateStart: record.mandateStart, mandateEnd: record.mandateEnd })[field]; }
function deterministicLegislatorId(sourceId: string, externalId: string) { return `legislator-${sourceId.replace(/-legislators$/, '')}-${externalId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }
function officeForSource(sourceId: string): Legislator['office'] { return sourceId === SENATE_LEGISLATORS_SOURCE_ID ? 'senador' : 'diputado'; }
function uniqueSlug(fullName: string, externalId: string, locals: Legislator[]) { const base = slugify(fullName); return locals.some((item) => item.slug === base) ? `${base}-${externalId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-8)}`.slice(0, 120) : base; }
function stripLegislatorMeta(item: Legislator) { const { id: _id, updatedAt: _updatedAt, ...input } = item; return input; }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function summary(item: Legislator) { return { id: item.id, fullName: item.fullName, district: item.district, bloc: item.bloc, published: item.published }; }
async function runInChunks<T>(items: T[], size: number, action: (item: T) => Promise<void>) { for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(action)); }
