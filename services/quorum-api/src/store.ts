import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import type {
  ContentRevision, ExternalSource, ExternalSyncRun, FieldProvenance, Legislator,
  LegislatorImportSuggestion, LegislatorRevision, Project, PublicProject,
} from '@politeia/quorum-contracts';
import { config } from './config.js';
import { initialCatalogs, initialProjects, initialSettings, initialWorkflow } from './seedData.js';
import { clearDataCache, invalidateCollectionCache } from './dataCache.js';

export const collections = {
  projects: 'quorumProjects',
  publicProjects: 'quorumPublicProjects',
  legislators: 'quorumLegislators',
  glossary: 'quorumGlossaryTerms',
  workflows: 'quorumWorkflows',
  catalogs: 'quorumCatalogItems',
  revisions: 'quorumContentRevisions',
  subscriptions: 'quorumSubscriptions',
  subscriptionTokens: 'quorumSubscriptionTokens',
  mailJobs: 'quorumMailJobs',
  roles: 'quorumRoleAssignments',
  audits: 'quorumAuditEvents',
  settings: 'quorumSiteSettings',
  metrics: 'quorumMetricsDaily',
  uploads: 'quorumUploadedDocuments',
  externalSources: 'quorumExternalSources',
  externalSyncRuns: 'quorumExternalSyncRuns',
  sourceSnapshots: 'quorumSourceSnapshots',
  externalLegislators: 'quorumExternalLegislators',
  externalEntityLinks: 'quorumExternalEntityLinks',
  fieldProvenance: 'quorumFieldProvenance',
  importSuggestions: 'quorumImportSuggestions',
  legislatorRevisions: 'quorumLegislatorRevisions',
} as const;

export type CollectionKey = keyof typeof collections;
export type RecordValue = Record<string, unknown>;

export interface PublishBundle {
  project: Project;
  publicProject: PublicProject;
  revision: ContentRevision;
  audit: RecordValue & { id: string };
  mailJob?: RecordValue & { id: string };
}

export interface LegislatorReviewBundle {
  legislator: Legislator;
  revision: LegislatorRevision;
  suggestion: LegislatorImportSuggestion;
  audit: RecordValue & { id: string };
  provenance: FieldProvenance[];
}

export interface DataStore {
  list<T>(collection: CollectionKey): Promise<T[]>;
  get<T>(collection: CollectionKey, id: string): Promise<T | null>;
  set<T extends RecordValue>(collection: CollectionKey, id: string, value: T): Promise<T>;
  delete(collection: CollectionKey, id: string): Promise<void>;
  publish(bundle: PublishBundle): Promise<void>;
  acquireIntegrationLease(sourceId: string, runId: string, leaseUntil: string): Promise<boolean>;
  finalizeIntegrationRun(source: ExternalSource, run: ExternalSyncRun): Promise<void>;
  applyLegislatorReview(bundle: LegislatorReviewBundle): Promise<void>;
  incrementMetric(day: string, event: string): Promise<void>;
}

class MemoryStore implements DataStore {
  private records = new Map<CollectionKey, Map<string, RecordValue>>();

  constructor(seed = true) {
    for (const key of Object.keys(collections) as CollectionKey[]) this.records.set(key, new Map());
    if (seed) this.seed();
  }

  private seed() {
    const workflow = initialWorkflow();
    this.records.get('workflows')!.set(workflow.id, structuredClone(workflow) as unknown as RecordValue);
    for (const item of initialCatalogs) this.records.get('catalogs')!.set(item.id, structuredClone(item) as unknown as RecordValue);
    for (const project of initialProjects()) this.records.get('projects')!.set(project.id, structuredClone(project) as unknown as RecordValue);
    const settings = initialSettings();
    this.records.get('settings')!.set(settings.id, structuredClone(settings) as unknown as RecordValue);
  }

  async list<T>(collection: CollectionKey): Promise<T[]> {
    return [...this.records.get(collection)!.values()].map((value) => structuredClone(value) as T);
  }

  async get<T>(collection: CollectionKey, id: string): Promise<T | null> {
    const value = this.records.get(collection)!.get(id);
    return value ? structuredClone(value) as T : null;
  }

  async set<T extends RecordValue>(collection: CollectionKey, id: string, value: T): Promise<T> {
    this.records.get(collection)!.set(id, structuredClone(value));
    invalidateCollectionCache(collection);
    return structuredClone(value);
  }

  async delete(collection: CollectionKey, id: string) {
    this.records.get(collection)!.delete(id);
    invalidateCollectionCache(collection);
  }

  async publish(bundle: PublishBundle) {
    this.records.get('projects')!.set(bundle.project.id, structuredClone(bundle.project) as unknown as RecordValue);
    this.records.get('publicProjects')!.set(bundle.publicProject.id, structuredClone(bundle.publicProject) as unknown as RecordValue);
    this.records.get('revisions')!.set(bundle.revision.id, structuredClone(bundle.revision) as unknown as RecordValue);
    this.records.get('audits')!.set(bundle.audit.id, structuredClone(bundle.audit));
    if (bundle.mailJob) this.records.get('mailJobs')!.set(bundle.mailJob.id, structuredClone(bundle.mailJob));
    for (const collection of ['projects', 'publicProjects', 'revisions', 'audits', ...(bundle.mailJob ? ['mailJobs'] : [])] as CollectionKey[]) invalidateCollectionCache(collection);
  }

  async acquireIntegrationLease(sourceId: string, runId: string, leaseUntil: string) {
    const source = this.records.get('externalSources')!.get(sourceId) as ExternalSource | undefined;
    if (!source) return false;
    if (source.syncLeaseUntil && new Date(source.syncLeaseUntil).valueOf() > Date.now() && source.syncLeaseRunId !== runId) return false;
    this.records.get('externalSources')!.set(sourceId, { ...source, syncLeaseRunId: runId, syncLeaseUntil: leaseUntil });
    return true;
  }

  async finalizeIntegrationRun(source: ExternalSource, run: ExternalSyncRun) {
    this.records.get('externalSources')!.set(source.id, structuredClone(source) as unknown as RecordValue);
    this.records.get('externalSyncRuns')!.set(run.id, structuredClone(run) as unknown as RecordValue);
    invalidateCollectionCache('externalSources');
    invalidateCollectionCache('externalSyncRuns');
  }

  async applyLegislatorReview(bundle: LegislatorReviewBundle) {
    this.records.get('legislators')!.set(bundle.legislator.id, structuredClone(bundle.legislator) as unknown as RecordValue);
    this.records.get('legislatorRevisions')!.set(bundle.revision.id, structuredClone(bundle.revision) as unknown as RecordValue);
    this.records.get('importSuggestions')!.set(bundle.suggestion.id, structuredClone(bundle.suggestion) as unknown as RecordValue);
    this.records.get('audits')!.set(bundle.audit.id, structuredClone(bundle.audit));
    for (const item of bundle.provenance) this.records.get('fieldProvenance')!.set(item.id, structuredClone(item) as unknown as RecordValue);
    for (const collection of ['legislators', 'legislatorRevisions', 'importSuggestions', 'audits', 'fieldProvenance'] as CollectionKey[]) invalidateCollectionCache(collection);
  }

  async incrementMetric(day: string, event: string) {
    const current = this.records.get('metrics')!.get(day) || { id: day, events: {} };
    const events = current.events as Record<string, number>;
    events[event] = (events[event] || 0) + 1;
    this.records.get('metrics')!.set(day, current);
  }
}

class FirestoreStore implements DataStore {
  private firestore: Firestore;

  constructor() {
    this.firestore = new Firestore({
      projectId: config.gcpProjectId || undefined,
      databaseId: config.firestoreDatabaseId,
    });
  }

  private collection(key: CollectionKey) {
    return this.firestore.collection(collections[key]);
  }

  async list<T>(collection: CollectionKey): Promise<T[]> {
    const snapshot = await this.collection(collection).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
  }

  async get<T>(collection: CollectionKey, id: string): Promise<T | null> {
    const doc = await this.collection(collection).doc(id).get();
    return doc.exists ? ({ id: doc.id, ...doc.data() } as T) : null;
  }

  async set<T extends RecordValue>(collection: CollectionKey, id: string, value: T): Promise<T> {
    await this.collection(collection).doc(id).set(value, { merge: false });
    invalidateCollectionCache(collection);
    return value;
  }

  async delete(collection: CollectionKey, id: string) {
    await this.collection(collection).doc(id).delete();
    invalidateCollectionCache(collection);
  }

  async publish(bundle: PublishBundle) {
    await this.firestore.runTransaction(async (transaction) => {
      transaction.set(this.collection('projects').doc(bundle.project.id), bundle.project);
      transaction.set(this.collection('publicProjects').doc(bundle.publicProject.id), bundle.publicProject);
      transaction.set(this.collection('revisions').doc(bundle.revision.id), bundle.revision);
      transaction.set(this.collection('audits').doc(bundle.audit.id), bundle.audit);
      if (bundle.mailJob) transaction.set(this.collection('mailJobs').doc(bundle.mailJob.id), bundle.mailJob);
    });
    for (const collection of ['projects', 'publicProjects', 'revisions', 'audits', ...(bundle.mailJob ? ['mailJobs'] : [])] as CollectionKey[]) invalidateCollectionCache(collection);
  }

  async acquireIntegrationLease(sourceId: string, runId: string, leaseUntil: string) {
    const ref = this.collection('externalSources').doc(sourceId);
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const source = snapshot.data() as ExternalSource;
      if (source.syncLeaseUntil && new Date(source.syncLeaseUntil).valueOf() > Date.now() && source.syncLeaseRunId !== runId) return false;
      transaction.set(ref, { ...source, syncLeaseRunId: runId, syncLeaseUntil: leaseUntil }, { merge: false });
      return true;
    });
  }

  async finalizeIntegrationRun(source: ExternalSource, run: ExternalSyncRun) {
    await this.firestore.runTransaction(async (transaction) => {
      transaction.set(this.collection('externalSources').doc(source.id), source, { merge: false });
      transaction.set(this.collection('externalSyncRuns').doc(run.id), run, { merge: false });
    });
    invalidateCollectionCache('externalSources');
    invalidateCollectionCache('externalSyncRuns');
  }

  async applyLegislatorReview(bundle: LegislatorReviewBundle) {
    await this.firestore.runTransaction(async (transaction) => {
      transaction.set(this.collection('legislators').doc(bundle.legislator.id), bundle.legislator, { merge: false });
      transaction.set(this.collection('legislatorRevisions').doc(bundle.revision.id), bundle.revision, { merge: false });
      transaction.set(this.collection('importSuggestions').doc(bundle.suggestion.id), bundle.suggestion, { merge: false });
      transaction.set(this.collection('audits').doc(bundle.audit.id), bundle.audit, { merge: false });
      for (const item of bundle.provenance) transaction.set(this.collection('fieldProvenance').doc(item.id), item, { merge: false });
    });
    for (const collection of ['legislators', 'legislatorRevisions', 'importSuggestions', 'audits', 'fieldProvenance'] as CollectionKey[]) invalidateCollectionCache(collection);
  }

  async incrementMetric(day: string, event: string) {
    const ref = this.collection('metrics').doc(day);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data() || { id: day, events: {} };
      const events = { ...(data.events || {}) } as Record<string, number>;
      events[event] = (events[event] || 0) + 1;
      transaction.set(ref, { ...data, id: day, events }, { merge: false });
    });
  }
}

let overrideStore: DataStore | null = null;
let singleton: DataStore | null = null;

export function store(): DataStore {
  if (overrideStore) return overrideStore;
  if (!singleton) singleton = config.dataStore === 'firestore' ? new FirestoreStore() : new MemoryStore(true);
  return singleton;
}

export function setStoreForTests(value: DataStore | null) {
  clearDataCache();
  overrideStore = value;
}

export function createMemoryStore(seed = true): DataStore {
  return new MemoryStore(seed);
}

export function newId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
