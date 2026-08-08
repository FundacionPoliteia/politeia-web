import { z } from 'zod';
import {
  externalEntityLinkSchema, fieldProvenanceSchema, legislatorImportFieldSchema,
  legislatorRevisionSchema, legislatorSchema,
  type ExternalEntityLink, type ExternalLegislatorRecord, type ExternalSource, type FieldProvenance,
  type Legislator, type LegislatorImportField, type LegislatorImportSuggestion, type LegislatorRevision,
} from '@politeia/quorum-contracts';
import { ApiError, notFound } from '../errors.js';
import { newId, store } from '../store.js';
import { importExternalLegislator } from './legislatorImport.js';

const applySchema = z.object({ fields: z.array(legislatorImportFieldSchema).min(1), confirmPublic: z.boolean().default(false) });
const dismissSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function listLegislatorSuggestions(query: Record<string, unknown>) {
  const sourceId = String(query.sourceId || ''); const status = String(query.status || 'pending');
  const changeType = String(query.changeType || ''); const district = normalize(String(query.district || ''));
  const bloc = normalize(String(query.bloc || '')); const linked = String(query.linked || '');
  const page = Math.max(1, Number(query.page || 1)); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 40)));
  const [all, sources] = await Promise.all([store().list<LegislatorImportSuggestion>('importSuggestions'), store().list<ExternalSource>('externalSources')]);
  const currentSnapshots = new Map(sources.map((item) => [item.id, item.lastSnapshotId]));
  const visible = all.filter((item) => item.status !== 'pending' || currentSnapshots.get(item.sourceId) === item.nextSnapshotId);
  const filtered = visible.filter((item) => (
    (!sourceId || item.sourceId === sourceId)
    && (!status || item.status === status)
    && (!changeType || item.changeType === changeType)
    && (!district || normalize(item.district) === district)
    && (!bloc || normalize(item.bloc) === bloc)
    && (!linked || (linked === 'yes' ? Boolean(item.localLegislatorId) : !item.localLegislatorId))
  )).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize,
    counts: visible.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {} as Record<string, number>),
  };
}

export async function applyLegislatorSuggestion(id: string, input: unknown, actorEmail: string, isAdmin: boolean) {
  const parsed = applySchema.parse(input);
  const suggestion = await pendingSuggestion(id);
  if (suggestion.changeType === 'removed') throw new ApiError(409, 'removed_legislator_not_applicable', 'Una baja oficial debe revisarse manualmente; no se elimina ningún perfil');
  const allowed = new Set(suggestion.changes.map((item) => item.field).filter((field): field is LegislatorImportField => legislatorImportFieldSchema.safeParse(field).success));
  if (parsed.fields.some((field) => !allowed.has(field))) throw new ApiError(422, 'suggestion_field_invalid', 'Seleccionaste un campo que no forma parte del cambio oficial');

  if (!suggestion.localLegislatorId) {
    if (suggestion.changeType !== 'added') throw new ApiError(409, 'suggestion_link_required', 'Vinculá primero el registro oficial con un perfil local');
    const imported = await importExternalLegislator({
      sourceId: suggestion.sourceId, externalId: suggestion.externalId, createNew: true, fields: parsed.fields,
    }, actorEmail);
    const timestamp = new Date().toISOString();
    const applied = { ...suggestion, localLegislatorId: imported.item.id, status: 'applied' as const, reviewedAt: timestamp, reviewedBy: actorEmail, appliedFields: parsed.fields };
    const revision = legislatorRevisionSchema.parse({
      id: newId('legislator-revision'), legislatorId: imported.item.id, before: null, after: imported.item,
      actorEmail, createdAt: timestamp, sourceId: suggestion.sourceId, snapshotId: suggestion.nextSnapshotId,
      suggestionId: suggestion.id, fields: parsed.fields, restoredFromRevisionId: null,
    });
    await Promise.all([
      store().set('importSuggestions', applied.id, applied),
      store().set('legislatorRevisions', revision.id, revision),
    ]);
    await revalidatePublic();
    return { item: imported.item, suggestion: applied, revision };
  }

  const current = await store().get<Legislator>('legislators', suggestion.localLegislatorId);
  if (!current) throw notFound('Perfil local');
  if (current.published && (!isAdmin || !parsed.confirmPublic)) {
    throw new ApiError(409, 'public_legislator_confirmation_required', 'Este perfil es público. Un administrador debe confirmar que los cambios serán visibles inmediatamente');
  }
  const [record, source] = await Promise.all([
    currentExternalRecord(suggestion),
    store().get<ExternalSource>('externalSources', suggestion.sourceId),
  ]);
  const nextData = { ...current } as Legislator;
  for (const field of parsed.fields) applyField(nextData, field, record);
  const timestamp = new Date().toISOString();
  const next = legislatorSchema.parse({ ...nextData, updatedAt: timestamp });
  const revision = legislatorRevisionSchema.parse({
    id: newId('legislator-revision'), legislatorId: next.id, before: current, after: next,
    actorEmail, createdAt: timestamp, sourceId: suggestion.sourceId, snapshotId: suggestion.nextSnapshotId,
    suggestionId: suggestion.id, fields: parsed.fields, restoredFromRevisionId: null,
  });
  const applied = { ...suggestion, status: 'applied' as const, reviewedAt: timestamp, reviewedBy: actorEmail, appliedFields: parsed.fields };
  const provenance = parsed.fields.map((field) => fieldProvenanceSchema.parse({
    id: `${suggestion.sourceId}:${suggestion.externalId.toLowerCase()}:${field}:${suggestion.nextSnapshotId}`,
    localEntityType: 'legislator', localEntityId: next.id, field, sourceId: suggestion.sourceId,
    externalRecordId: record.id, snapshotId: suggestion.nextSnapshotId, sourceUrl: record.officialUrl || source?.datasetUrl || '',
    sourceValue: externalValue(record, field), appliedAt: timestamp, appliedBy: actorEmail,
  })) as FieldProvenance[];
  const audit = { id: newId('audit'), type: 'legislator.suggestion.applied', actorEmail, targetId: next.id, details: { suggestionId: id, fields: parsed.fields, public: current.published }, createdAt: timestamp };
  await store().applyLegislatorReview({ legislator: next, revision, suggestion: applied, audit, provenance });
  await updateLinkSnapshot(suggestion, record, actorEmail);
  await revalidatePublic();
  return { item: next, suggestion: applied, revision };
}

export async function dismissLegislatorSuggestion(id: string, input: unknown, actorEmail: string) {
  const parsed = dismissSchema.parse(input); const suggestion = await pendingSuggestion(id); const timestamp = new Date().toISOString();
  const next = { ...suggestion, status: 'dismissed' as const, reviewedAt: timestamp, reviewedBy: actorEmail, reviewReason: parsed.reason };
  await store().set('importSuggestions', id, next);
  await audit('legislator.suggestion.dismissed', actorEmail, suggestion.localLegislatorId || suggestion.externalId, { suggestionId: id, reason: parsed.reason });
  return next;
}

export async function reopenLegislatorSuggestion(id: string, actorEmail: string) {
  const suggestion = await store().get<LegislatorImportSuggestion>('importSuggestions', id);
  if (!suggestion) throw notFound('Cambio oficial');
  if (suggestion.status !== 'dismissed') throw new ApiError(409, 'suggestion_not_dismissed', 'Sólo se pueden reabrir cambios descartados');
  const next = { ...suggestion, status: 'pending' as const, reviewedAt: null, reviewedBy: null, reviewReason: '' };
  await store().set('importSuggestions', id, next);
  await audit('legislator.suggestion.reopened', actorEmail, suggestion.localLegislatorId || suggestion.externalId, { suggestionId: id });
  return next;
}

export async function listLegislatorRevisions(legislatorId: string) {
  return (await store().list<LegislatorRevision>('legislatorRevisions')).filter((item) => item.legislatorId === legislatorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreLegislatorRevision(legislatorId: string, revisionId: string, actorEmail: string) {
  const [current, revision] = await Promise.all([
    store().get<Legislator>('legislators', legislatorId), store().get<LegislatorRevision>('legislatorRevisions', revisionId),
  ]);
  if (!current || !revision || revision.legislatorId !== legislatorId || !revision.before) throw notFound('Revisión de legislador');
  const timestamp = new Date().toISOString();
  const restored = legislatorSchema.parse({ ...revision.before, id: legislatorId, updatedAt: timestamp });
  const restoration = legislatorRevisionSchema.parse({
    id: newId('legislator-revision'), legislatorId, before: current, after: restored, actorEmail, createdAt: timestamp,
    sourceId: revision.sourceId, snapshotId: revision.snapshotId, suggestionId: null, fields: revision.fields, restoredFromRevisionId: revision.id,
  });
  await Promise.all([
    store().set('legislators', legislatorId, restored), store().set('legislatorRevisions', restoration.id, restoration),
    audit('legislator.revision.restored', actorEmail, legislatorId, { revisionId, restorationId: restoration.id }),
  ]);
  await revalidatePublic();
  return { item: restored, revision: restoration };
}

async function pendingSuggestion(id: string) {
  const item = await store().get<LegislatorImportSuggestion>('importSuggestions', id);
  if (!item) throw notFound('Cambio oficial');
  if (item.status !== 'pending') throw new ApiError(409, 'suggestion_not_pending', 'El cambio ya fue revisado o reemplazado');
  const source = await store().get<ExternalSource>('externalSources', item.sourceId);
  if (!source || source.lastSnapshotId !== item.nextSnapshotId) throw new ApiError(409, 'suggestion_snapshot_not_current', 'El cambio todavÃ­a no pertenece al snapshot oficial vigente');
  return item;
}
async function currentExternalRecord(item: LegislatorImportSuggestion) {
  const records = await store().list<ExternalLegislatorRecord>('externalLegislators');
  const record = records.find((candidate) => candidate.sourceId === item.sourceId && candidate.snapshotId === item.nextSnapshotId && candidate.externalId.toLowerCase() === item.externalId.toLowerCase());
  if (!record) throw notFound('Registro oficial vigente');
  return record;
}
async function updateLinkSnapshot(item: LegislatorImportSuggestion, record: ExternalLegislatorRecord, actorEmail: string) {
  const id = `${item.sourceId}:${item.externalId.toLowerCase()}`;
  const existing = await store().get<ExternalEntityLink>('externalEntityLinks', id);
  if (!existing) return;
  await store().set('externalEntityLinks', id, externalEntityLinkSchema.parse({ ...existing, officialUrl: record.officialUrl, lastImportedSnapshotId: record.snapshotId, linkedBy: actorEmail }));
}
function applyField(target: Legislator, field: LegislatorImportField, record: ExternalLegislatorRecord) {
  if (field === 'fullName') target.fullName = record.fullName;
  if (field === 'district') target.district = record.district;
  if (field === 'party') target.party = record.party;
  if (field === 'bloc') target.bloc = record.currentBloc;
  if (field === 'mandateStart') target.mandateStart = record.mandateStart;
  if (field === 'mandateEnd') target.mandateEnd = record.mandateEnd;
}
function externalValue(record: ExternalLegislatorRecord, field: LegislatorImportField) {
  return ({ fullName: record.fullName, district: record.district, party: record.party, bloc: record.currentBloc, mandateStart: record.mandateStart, mandateEnd: record.mandateEnd })[field];
}
async function audit(type: string, actorEmail: string, targetId: string, details: Record<string, unknown>) {
  const id = newId('audit'); await store().set('audits', id, { id, type, actorEmail, targetId, details, createdAt: new Date().toISOString() });
}
async function revalidatePublic() {
  if (!process.env.NEXT_REVALIDATE_URL || !process.env.NEXT_REVALIDATE_SECRET) return;
  await fetch(process.env.NEXT_REVALIDATE_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': process.env.NEXT_REVALIDATE_SECRET }, body: '{}' }).catch(() => undefined);
}
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
