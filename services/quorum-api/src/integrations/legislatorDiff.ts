import {
  legislatorImportSuggestionSchema,
  type ExternalEntityLink,
  type ExternalLegislatorRecord,
  type Legislator,
  type LegislatorImportSuggestion,
  type LegislatorSuggestionChange,
  type LegislatorSuggestionField,
} from '@politeia/quorum-contracts';
import { store } from '../store.js';

const comparedFields: LegislatorSuggestionField[] = [
  'fullName', 'district', 'party', 'bloc', 'mandateStart', 'mandateEnd',
  'oathDate', 'cessationDate', 'blocHistory', 'officialUrl',
];

export async function buildAndPersistLegislatorDiff(
  sourceId: string,
  previousSnapshotId: string | null,
  nextSnapshotId: string,
  nextRecords: ExternalLegislatorRecord[],
) {
  if (!previousSnapshotId) return { added: 0, removed: 0, changed: 0, suggestionIds: [] as string[] };

  const [allRecords, links, locals, existingSuggestions] = await Promise.all([
    store().list<ExternalLegislatorRecord>('externalLegislators'),
    store().list<ExternalEntityLink>('externalEntityLinks'),
    store().list<Legislator>('legislators'),
    store().list<LegislatorImportSuggestion>('importSuggestions'),
  ]);
  const previousRecords = allRecords.filter((item) => item.sourceId === sourceId && item.snapshotId === previousSnapshotId);
  const previousById = new Map(previousRecords.map((item) => [item.externalId.toLowerCase(), item]));
  const nextById = new Map(nextRecords.map((item) => [item.externalId.toLowerCase(), item]));
  const linksById = new Map(links.filter((item) => item.sourceId === sourceId).map((item) => [item.externalId.toLowerCase(), item]));
  const localsById = new Map(locals.map((item) => [item.id, item]));
  const timestamp = new Date().toISOString();
  const suggestions: LegislatorImportSuggestion[] = [];

  for (const record of nextRecords) {
    const key = record.externalId.toLowerCase();
    const previous = previousById.get(key) || null;
    const changeType = previous ? 'changed' as const : 'added' as const;
    const link = linksById.get(key) || null;
    const local = link ? localsById.get(link.localEntityId) || null : null;
    const changes = diffFields(previous, record, local);
    if (previous && !changes.length) continue;
    suggestions.push(makeSuggestion({ sourceId, previousSnapshotId, nextSnapshotId, record, previous, local, link, changes, changeType, timestamp }));
  }

  for (const previous of previousRecords) {
    const key = previous.externalId.toLowerCase();
    if (nextById.has(key)) continue;
    const link = linksById.get(key) || null;
    const local = link ? localsById.get(link.localEntityId) || null : null;
    suggestions.push(makeSuggestion({
      sourceId, previousSnapshotId, nextSnapshotId, record: null, previous, local, link,
      changes: diffFields(previous, null, local), changeType: 'removed', timestamp,
    }));
  }

  const changedExternalIds = new Set(suggestions.map((item) => item.externalId.toLowerCase()));
  await Promise.all(existingSuggestions
    .filter((item) => item.sourceId === sourceId && item.status === 'pending' && changedExternalIds.has(item.externalId.toLowerCase()))
    .map((item) => store().set('importSuggestions', item.id, { ...item, status: 'superseded' })));
  await writeInChunks(suggestions, 20, (item) => store().set('importSuggestions', item.id, item));

  return {
    added: suggestions.filter((item) => item.changeType === 'added').length,
    removed: suggestions.filter((item) => item.changeType === 'removed').length,
    changed: suggestions.filter((item) => item.changeType === 'changed').length,
    suggestionIds: suggestions.map((item) => item.id),
  };
}

function makeSuggestion(input: {
  sourceId: string; previousSnapshotId: string; nextSnapshotId: string;
  record: ExternalLegislatorRecord | null; previous: ExternalLegislatorRecord | null; local: Legislator | null;
  link: ExternalEntityLink | null; changes: LegislatorSuggestionChange[]; changeType: 'added' | 'removed' | 'changed'; timestamp: string;
}) {
  const sourceRecord = input.record || input.previous!;
  return legislatorImportSuggestionSchema.parse({
    id: `suggestion:${input.sourceId}:${input.nextSnapshotId}:${sourceRecord.externalId.toLowerCase()}`,
    sourceId: input.sourceId,
    externalId: sourceRecord.externalId,
    externalRecordId: input.record?.id || null,
    localLegislatorId: input.link?.localEntityId || null,
    previousSnapshotId: input.previousSnapshotId,
    nextSnapshotId: input.nextSnapshotId,
    changeType: input.changeType,
    fullName: sourceRecord.fullName,
    district: sourceRecord.district,
    bloc: sourceRecord.currentBloc,
    officialUrl: sourceRecord.officialUrl,
    changes: input.changes,
    status: 'pending', reviewedAt: null, reviewedBy: null, reviewReason: '', appliedFields: [], createdAt: input.timestamp,
  });
}

function diffFields(previous: ExternalLegislatorRecord | null, next: ExternalLegislatorRecord | null, local: Legislator | null) {
  const changes: LegislatorSuggestionChange[] = [];
  for (const field of comparedFields) {
    const before = sourceValue(previous, field);
    const after = sourceValue(next, field);
    if (stable(before) === stable(after)) continue;
    changes.push({ field, previousValue: before, nextValue: after, localValue: localValue(local, field) });
  }
  return changes;
}

function sourceValue(record: ExternalLegislatorRecord | null, field: LegislatorSuggestionField): unknown | null {
  if (!record) return null;
  if (field === 'bloc') return record.currentBloc;
  if (field === 'officialUrl') return record.officialUrl;
  return record[field as keyof ExternalLegislatorRecord] ?? null;
}

function localValue(record: Legislator | null, field: LegislatorSuggestionField): unknown | null {
  if (!record) return null;
  if (field === 'bloc') return record.bloc;
  if (field === 'oathDate' || field === 'cessationDate' || field === 'blocHistory' || field === 'officialUrl') return null;
  return record[field as keyof Legislator] ?? null;
}

function stable(value: unknown) { return JSON.stringify(value ?? null); }
async function writeInChunks<T>(items: T[], size: number, action: (item: T) => Promise<unknown>) {
  for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(action));
}
