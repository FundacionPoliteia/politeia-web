import { z } from 'zod';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(120);

export const catalogKindSchema = z.enum(['chamber', 'initiative']);
export type CatalogKind = z.infer<typeof catalogKindSchema>;

export const catalogItemSchema = z.object({
  id: slugSchema,
  kind: catalogKindSchema,
  label: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  order: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const workflowStageSchema = z.object({
  id: slugSchema,
  label: z.string().trim().min(2).max(100),
  shortLabel: z.string().trim().min(2).max(40),
  description: z.string().trim().max(500).default(''),
  order: z.number().int().min(0),
  branchFromId: slugSchema.nullable().default(null),
  terminal: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type WorkflowStage = z.infer<typeof workflowStageSchema>;

export const workflowDefinitionSchema = z.object({
  id: slugSchema,
  name: z.string().trim().min(2).max(100),
  version: z.number().int().positive(),
  active: z.boolean().default(true),
  stages: z.array(workflowStageSchema).min(1),
  createdAt: isoDateTimeSchema,
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const projectStageExplanationSchema = z.object({
  stageId: slugSchema,
  summary: z.string().trim().min(20).max(1000),
  contextualDetail: z.string().trim().min(20).max(2500),
});
export type ProjectStageExplanation = z.infer<typeof projectStageExplanationSchema>;

export const sourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(2).max(180),
  url: z.string().url(),
  publishedAt: isoDateSchema.nullable().default(null),
});
export type Source = z.infer<typeof sourceSchema>;

export const officialDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2).max(180),
  kind: z.enum(['link', 'pdf']),
  url: z.string().url(),
  sourceLabel: z.string().trim().max(120).default(''),
  documentDate: isoDateSchema.nullable().default(null),
});
export type OfficialDocument = z.infer<typeof officialDocumentSchema>;

export const projectUpdateSchema = z.object({
  id: z.string().min(1),
  date: isoDateSchema,
  title: z.string().trim().min(2).max(180),
  body: z.string().trim().min(2).max(5000),
  stageId: slugSchema.nullable().default(null),
  showStageChange: z.boolean().optional(),
  sources: z.array(sourceSchema).default([]),
});
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const projectSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: z.string().trim().min(3).max(220),
  docketNumber: z.string().trim().max(80).default(''),
  entryDate: isoDateSchema.nullable().default(null),
  originChamberId: slugSchema.nullable().default(null),
  initiativeTypeId: slugSchema.nullable().default(null),
  workflowId: slugSchema,
  workflowVersion: z.number().int().positive(),
  currentStageId: slugSchema,
  stageExplanationOverrides: z.array(projectStageExplanationSchema).max(50).default([]),
  summary: z.string().trim().max(15000).default(''),
  summaryFormat: z.enum(['plain', 'markdown']).default('plain'),
  impact: z.string().trim().max(10000).default(''),
  impactFormat: z.enum(['plain', 'markdown']).default('plain'),
  authorLegislatorId: z.string().nullable().default(null),
  signatoryIds: z.array(z.string()).default([]),
  glossaryTermIds: z.array(z.string()).default([]),
  glossaryEnabled: z.boolean().default(true),
  glossaryExcludedTermIds: z.array(z.string()).default([]),
  glossaryOccurrenceMode: z.enum(['all', 'first', 'custom']).default('all'),
  glossaryExcludedOccurrenceIds: z.array(z.string()).default([]),
  documents: z.array(officialDocumentSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  updates: z.array(projectUpdateSchema).default([]),
  featured: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
  status: z.enum(['draft', 'published', 'unpublished', 'archived']).default('draft'),
  publishedRevisionId: z.string().nullable().default(null),
  publishedAt: isoDateTimeSchema.nullable().default(null),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().email(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectInputSchema = projectSchema.omit({
  id: true,
  status: true,
  publishedRevisionId: true,
  publishedAt: true,
  updatedAt: true,
  updatedBy: true,
}).partial({
  docketNumber: true,
  entryDate: true,
  originChamberId: true,
  initiativeTypeId: true,
  summary: true,
  impact: true,
  authorLegislatorId: true,
  signatoryIds: true,
  glossaryTermIds: true,
  glossaryEnabled: true,
  glossaryExcludedTermIds: true,
  glossaryOccurrenceMode: true,
  glossaryExcludedOccurrenceIds: true,
  stageExplanationOverrides: true,
  documents: true,
  sources: true,
  updates: true,
  featured: true,
  order: true,
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const legislatorSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  fullName: z.string().trim().min(3).max(160),
  party: z.string().trim().max(120).default(''),
  bloc: z.string().trim().max(120).default(''),
  district: z.string().trim().max(120).default(''),
  office: z.enum(['diputado', 'senador', 'otro']),
  mandateStart: isoDateSchema.nullable().default(null),
  mandateEnd: isoDateSchema.nullable().default(null),
  academicTitle: z.string().trim().max(180).default(''),
  bio: z.string().trim().max(3000).default(''),
  attendance: z.object({
    value: z.number().min(0).max(100),
    asOf: isoDateSchema,
    sourceUrl: z.string().url(),
  }).nullable().default(null),
  published: z.boolean().default(false),
  updatedAt: isoDateTimeSchema,
});
export type Legislator = z.infer<typeof legislatorSchema>;
export const legislatorInputSchema = legislatorSchema.omit({ id: true, updatedAt: true });
export const publicLegislatorAttributionSchema = legislatorSchema.pick({
  id: true,
  slug: true,
  fullName: true,
  party: true,
  bloc: true,
  district: true,
  office: true,
  published: true,
});
export type PublicLegislatorAttribution = z.infer<typeof publicLegislatorAttributionSchema>;

export const glossaryTermSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  term: z.string().trim().min(2).max(120),
  shortDefinition: z.string().trim().max(320).default(''),
  definition: z.string().trim().min(3).max(5000),
  definitionFormat: z.enum(['plain', 'markdown']).default('plain'),
  aliases: z.array(z.string().trim().min(2).max(120)).max(30).default([]),
  inlineEnabled: z.boolean().default(false),
  references: z.array(sourceSchema).default([]),
  published: z.boolean().default(false),
  updatedBy: z.union([z.string().email(), z.literal('')]).default(''),
  updatedAt: isoDateTimeSchema,
});
export type GlossaryTerm = z.infer<typeof glossaryTermSchema>;
export const glossaryTermInputSchema = glossaryTermSchema.omit({ id: true, updatedAt: true, updatedBy: true });

export const contentRevisionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  number: z.number().int().positive(),
  snapshot: projectSchema,
  actorEmail: z.string().email(),
  createdAt: isoDateTimeSchema,
  changeSummary: z.string().trim().max(500),
  notifyFollowers: z.boolean(),
  restoredFromRevisionId: z.string().nullable().default(null),
});
export type ContentRevision = z.infer<typeof contentRevisionSchema>;

export const legislativeStageExplanationSchema = z.object({
  workflowId: slugSchema,
  workflowVersion: z.number().int().positive(),
  stageId: slugSchema,
  chamberId: slugSchema.nullable().default(null),
  initiativeTypeId: slugSchema.nullable().default(null),
  summary: z.string().trim().min(20).max(1000),
  contextualDetail: z.string().trim().min(20).max(2500),
});
export type LegislativeStageExplanation = z.infer<typeof legislativeStageExplanationSchema>;

export const siteSettingsSchema = z.object({
  id: z.literal('public'),
  electionPortal: z.object({
    enabled: z.boolean().default(false),
    title: z.string().trim().max(160).default(''),
    description: z.string().trim().max(500).default(''),
    url: z.union([z.string().url(), z.literal('')]).default(''),
    label: z.string().trim().max(80).default('Conocer el proyecto electoral'),
  }),
  legislativeStageExplanations: z.array(legislativeStageExplanationSchema).max(500).default([]),
  subscriptionsEnabled: z.boolean().default(false),
  privacyPolicyApproved: z.boolean().default(false),
  updatedAt: isoDateTimeSchema,
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const roleSchema = z.enum(['quorum_editor', 'quorum_admin']);
export type Role = z.infer<typeof roleSchema>;
export const roleAssignmentSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  roles: z.array(roleSchema).min(1),
  active: z.boolean().default(true),
  updatedAt: isoDateTimeSchema,
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

export const subscriptionSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  projectIds: z.array(z.string()).default([]),
  status: z.enum(['pending', 'active', 'unsubscribed', 'deleted']),
  consentAt: isoDateTimeSchema,
  confirmedAt: isoDateTimeSchema.nullable().default(null),
  updatedAt: isoDateTimeSchema,
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const integrationModeSchema = z.enum(['shadow', 'assisted', 'active']);
export type IntegrationMode = z.infer<typeof integrationModeSchema>;

export const externalSourceSchema = z.object({
  id: slugSchema,
  label: z.string().trim().min(2).max(120),
  organization: z.string().trim().min(2).max(180),
  datasetId: z.string().trim().min(2).max(160),
  datasetUrl: z.string().url(),
  license: z.string().trim().min(2).max(160),
  attribution: z.string().trim().min(2).max(300),
  mode: integrationModeSchema,
  enabled: z.boolean(),
  lastAttemptAt: isoDateTimeSchema.nullable().default(null),
  lastSuccessfulSyncAt: isoDateTimeSchema.nullable(),
  lastObservedChangeAt: isoDateTimeSchema.nullable(),
  nextScheduledSyncAt: isoDateTimeSchema.nullable().default(null),
  consecutiveFailures: z.number().int().min(0).default(0),
  httpEtag: z.string().max(500).nullable().default(null),
  httpLastModified: z.string().max(500).nullable().default(null),
  syncLeaseRunId: z.string().nullable().default(null),
  syncLeaseUntil: isoDateTimeSchema.nullable().default(null),
  lastSnapshotId: z.string().nullable(),
  lastError: z.string().max(1000).nullable(),
  updatedAt: isoDateTimeSchema,
});
export type ExternalSource = z.infer<typeof externalSourceSchema>;

export const externalSyncRunSchema = z.object({
  id: z.string().min(1),
  sourceId: slugSchema,
  status: z.enum(['running', 'unchanged', 'succeeded', 'quarantined', 'failed']),
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  actorEmail: z.string().email(),
  trigger: z.enum(['scheduled', 'manual', 'cli']).default('manual'),
  forceDownload: z.boolean().default(false),
  snapshotId: z.string().nullable(),
  recordCount: z.number().int().min(0),
  changes: z.object({
    added: z.number().int().min(0),
    removed: z.number().int().min(0),
    changed: z.number().int().min(0),
  }).default({ added: 0, removed: 0, changed: 0 }),
  errorCode: z.string().max(120).nullable(),
  errorMessage: z.string().max(1000).nullable(),
});
export type ExternalSyncRun = z.infer<typeof externalSyncRunSchema>;

export const sourceSnapshotSchema = z.object({
  id: z.string().min(1),
  sourceId: slugSchema,
  datasetId: z.string().min(1),
  resourceId: z.string().min(1),
  resourceUrl: z.string().url(),
  retrievedAt: isoDateTimeSchema,
  sourceModifiedAt: isoDateTimeSchema.nullable(),
  objectPath: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().min(1),
  recordCount: z.number().int().min(0),
  schemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['valid', 'quarantined', 'superseded']),
  quarantineReason: z.string().max(1000).nullable(),
});
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;

export const externalBlocMembershipSchema = z.object({
  name: z.string().trim().min(1).max(200),
  start: isoDateSchema.nullable(),
  end: isoDateSchema.nullable(),
});
export type ExternalBlocMembership = z.infer<typeof externalBlocMembershipSchema>;

export const externalLegislatorRecordSchema = z.object({
  id: z.string().min(1),
  sourceId: slugSchema,
  externalId: z.string().trim().min(2).max(120),
  snapshotId: z.string().min(1),
  officialUrl: z.string().url().nullable(),
  fullName: z.string().trim().min(2).max(220),
  givenNames: z.string().trim().min(1).max(160),
  familyName: z.string().trim().min(1).max(160),
  gender: z.enum(['F', 'M', 'X', 'unknown']),
  district: z.string().trim().min(1).max(160),
  mandateStart: isoDateSchema,
  mandateEnd: isoDateSchema,
  oathDate: isoDateSchema.nullable(),
  cessationDate: isoDateSchema.nullable(),
  party: z.string().trim().max(200).default(''),
  currentBloc: z.string().trim().max(200),
  blocHistory: z.array(externalBlocMembershipSchema),
  observedAt: isoDateTimeSchema,
  rawFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ExternalLegislatorRecord = z.infer<typeof externalLegislatorRecordSchema>;

export const externalEntityLinkSchema = z.object({
  id: z.string().min(1),
  localEntityType: z.literal('legislator'),
  localEntityId: z.string().min(1),
  sourceId: slugSchema,
  externalId: z.string().min(1),
  officialUrl: z.string().url().nullable(),
  confidence: z.enum(['exact', 'reviewed']),
  linkedAt: isoDateTimeSchema,
  linkedBy: z.string().email(),
  lastImportedSnapshotId: z.string().min(1),
});
export type ExternalEntityLink = z.infer<typeof externalEntityLinkSchema>;

export const legislatorImportFieldSchema = z.enum(['fullName', 'district', 'party', 'bloc', 'mandateStart', 'mandateEnd']);
export type LegislatorImportField = z.infer<typeof legislatorImportFieldSchema>;

export const fieldProvenanceSchema = z.object({
  id: z.string().min(1),
  localEntityType: z.literal('legislator'),
  localEntityId: z.string().min(1),
  field: legislatorImportFieldSchema,
  sourceId: slugSchema,
  externalRecordId: z.string().min(1),
  snapshotId: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceValue: z.unknown(),
  appliedAt: isoDateTimeSchema,
  appliedBy: z.string().email(),
});
export type FieldProvenance = z.infer<typeof fieldProvenanceSchema>;

export const legislatorSuggestionFieldSchema = z.enum([
  'fullName', 'district', 'party', 'bloc', 'mandateStart', 'mandateEnd',
  'oathDate', 'cessationDate', 'blocHistory', 'officialUrl',
]);
export type LegislatorSuggestionField = z.infer<typeof legislatorSuggestionFieldSchema>;

export const legislatorSuggestionChangeSchema = z.object({
  field: legislatorSuggestionFieldSchema,
  previousValue: z.unknown().nullable(),
  nextValue: z.unknown().nullable(),
  localValue: z.unknown().nullable(),
});
export type LegislatorSuggestionChange = z.infer<typeof legislatorSuggestionChangeSchema>;

export const legislatorImportSuggestionSchema = z.object({
  id: z.string().min(1),
  sourceId: slugSchema,
  externalId: z.string().min(1),
  externalRecordId: z.string().nullable(),
  localLegislatorId: z.string().nullable(),
  previousSnapshotId: z.string().nullable(),
  nextSnapshotId: z.string().min(1),
  changeType: z.enum(['added', 'removed', 'changed']),
  fullName: z.string().min(1).max(220),
  district: z.string().max(160).default(''),
  bloc: z.string().max(200).default(''),
  officialUrl: z.string().url().nullable(),
  changes: z.array(legislatorSuggestionChangeSchema),
  status: z.enum(['pending', 'applied', 'dismissed', 'superseded']).default('pending'),
  reviewedAt: isoDateTimeSchema.nullable().default(null),
  reviewedBy: z.string().email().nullable().default(null),
  reviewReason: z.string().max(500).default(''),
  appliedFields: z.array(legislatorImportFieldSchema).default([]),
  createdAt: isoDateTimeSchema,
});
export type LegislatorImportSuggestion = z.infer<typeof legislatorImportSuggestionSchema>;

export const legislatorRevisionSchema = z.object({
  id: z.string().min(1),
  legislatorId: z.string().min(1),
  before: legislatorSchema.nullable(),
  after: legislatorSchema,
  actorEmail: z.string().email(),
  createdAt: isoDateTimeSchema,
  sourceId: slugSchema.nullable().default(null),
  snapshotId: z.string().nullable().default(null),
  suggestionId: z.string().nullable().default(null),
  fields: z.array(legislatorImportFieldSchema).default([]),
  restoredFromRevisionId: z.string().nullable().default(null),
});
export type LegislatorRevision = z.infer<typeof legislatorRevisionSchema>;

export const publicProjectSchema = projectSchema.extend({
  historicalStageId: slugSchema.optional(),
  workflow: workflowDefinitionSchema,
  chamber: catalogItemSchema.nullable(),
  initiative: catalogItemSchema.nullable(),
  author: legislatorSchema.nullable(),
  signatories: z.array(legislatorSchema),
  authorAttribution: publicLegislatorAttributionSchema.nullable().default(null),
  signatoryAttributions: z.array(publicLegislatorAttributionSchema).default([]),
  glossary: z.array(glossaryTermSchema),
});
export type PublicProject = z.infer<typeof publicProjectSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export function normalizeGlossarySearchText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function glossaryTermAppearsInTexts(
  term: Pick<GlossaryTerm, 'term' | 'aliases'>,
  texts: readonly string[],
): boolean {
  const phrases = [term.term, ...term.aliases]
    .map(normalizeGlossarySearchText)
    .filter((phrase) => phrase.length >= 2);
  return texts.some((text) => {
    const normalized = normalizeGlossarySearchText(text);
    if (!normalized) return false;
    const padded = ` ${normalized} `;
    return phrases.some((phrase) => padded.includes(` ${phrase} `));
  });
}

export function stageProgress(workflow: WorkflowDefinition, currentStageId: string) {
  const mainStages = workflow.stages.filter((stage) => !stage.branchFromId && stage.active).sort((a, b) => a.order - b.order);
  const current = workflow.stages.find((stage) => stage.id === currentStageId);
  const branchOrigin = current?.branchFromId ? workflow.stages.find((stage) => stage.id === current.branchFromId) : current;
  const activeOrder = branchOrigin?.order ?? -1;
  return mainStages.map((stage) => ({
    ...stage,
    state: stage.order < activeOrder ? 'complete' : stage.order === activeOrder ? 'current' : 'upcoming',
  } as const));
}

export function effectiveProjectStageId(project: Pick<Project, 'currentStageId' | 'updates'>) {
  let effective = project.currentStageId;
  let latestDate = '';
  let latestIndex = -1;
  project.updates.forEach((update, index) => {
    if (!update.stageId) return;
    if (update.date > latestDate || (update.date === latestDate && index > latestIndex)) {
      effective = update.stageId;
      latestDate = update.date;
      latestIndex = index;
    }
  });
  return effective;
}

export function hasChronologyChanges(
  current: { updates?: readonly ProjectUpdate[] },
  published: { updates?: readonly ProjectUpdate[] } | null | undefined,
) {
  if (!published) return false;
  return JSON.stringify(current.updates || []) !== JSON.stringify(published.updates || []);
}
