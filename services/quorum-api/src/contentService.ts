import { randomUUID } from 'node:crypto';
import {
  catalogItemSchema,
  effectiveProjectStageId,
  glossaryTermInputSchema,
  glossaryTermSchema,
  glossaryTermAppearsInTexts,
  hasChronologyChanges,
  legislatorInputSchema,
  legislatorSchema,
  projectInputSchema,
  projectSchema,
  siteSettingsSchema,
  slugify,
  workflowDefinitionSchema,
  type CatalogItem,
  type ContentRevision,
  type GlossaryTerm,
  type Legislator,
  type Project,
  type ProjectInput,
  type PublicProject,
  type SiteSettings,
  type WorkflowDefinition,
} from '@politeia/quorum-contracts';
import { ApiError, notFound } from './errors.js';
import { cachedGet, cachedList, cachedValue, cacheTtl } from './dataCache.js';
import { newId, store } from './store.js';

const now = () => new Date().toISOString();

export async function listPublicProjects(): Promise<PublicProject[]> {
  return cachedValue('derived:public:projects', cacheTtl.publicProjection, async () => {
    const dataStore = store();
    const [items, drafts, legislators, glossary] = await Promise.all([
      cachedList<PublicProject>(dataStore, 'publicProjects', cacheTtl.publicProjection),
      cachedList<Project>(dataStore, 'projects', cacheTtl.publicProjection),
      cachedList<Legislator>(dataStore, 'legislators', cacheTtl.referenceData),
      cachedList<GlossaryTerm>(dataStore, 'glossary', cacheTtl.referenceData),
    ]);
    const publicGlossary = glossary.map(normalizeGlossaryTerm).filter((item) => item.published);
    const historicalStages = new Map(drafts.map((item) => [item.id, item.currentStageId]));
    return items.filter((item) => item.status === 'published').map((item) => withCanonicalRelations({ ...item, historicalStageId: item.historicalStageId || historicalStages.get(item.id) }, legislators, publicGlossary)).sort(sortProjects);
  });
}

export async function getPublicProject(slug: string): Promise<PublicProject> {
  const items = await listPublicProjects();
  const item = items.find((project) => project.slug === slug);
  if (!item) throw notFound('Proyecto');
  return item;
}

export async function getPublicBootstrap() {
  return cachedValue('derived:public:bootstrap', cacheTtl.publicProjection, async () => {
    const dataStore = store();
    const [projects, catalogs, workflows, settings, legislators, glossary] = await Promise.all([
      listPublicProjects(),
      cachedList<CatalogItem>(dataStore, 'catalogs', cacheTtl.referenceData),
      cachedList<WorkflowDefinition>(dataStore, 'workflows', cacheTtl.referenceData),
      cachedGet<SiteSettings>(dataStore, 'settings', 'public', cacheTtl.referenceData),
      cachedList<Legislator>(dataStore, 'legislators', cacheTtl.referenceData),
      cachedList<GlossaryTerm>(dataStore, 'glossary', cacheTtl.referenceData),
    ]);
    if (!settings) throw new ApiError(500, 'settings_missing', 'La configuraciÃ³n pÃºblica no fue inicializada');
    return {
      projects,
      catalogs: catalogs.filter((item) => item.active).sort((a, b) => a.order - b.order),
      workflows: workflows.filter((item) => item.active),
      settings: siteSettingsSchema.parse(settings),
      legislators: legislators.filter((item) => item.published).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
      glossary: glossary.map(normalizeGlossaryTerm).filter((item) => item.published).sort((a, b) => a.term.localeCompare(b.term, 'es')),
    };
  });
}

export async function getManageBootstrap() {
  const [projects, catalogs, workflows, settings, legislators, glossary, subscriptions, roles, audits, revisions] = await Promise.all([
    store().list<Project>('projects'),
    store().list<CatalogItem>('catalogs'),
    store().list<WorkflowDefinition>('workflows'),
    getSettings(),
    store().list<Legislator>('legislators'),
    store().list<GlossaryTerm>('glossary'),
    store().list('subscriptions'),
    store().list('roles'),
    store().list('audits'),
    store().list<ContentRevision>('revisions'),
  ]);
  return {
    projects: projects.sort(sortProjects), catalogs, workflows, settings, legislators, glossary: glossary.map(normalizeGlossaryTerm),
    subscriptions, roles, audits, revisions,
  };
}

export async function previewProject(id: string, input?: unknown) {
  const project = await store().get<Project>('projects', id);
  if (!project) throw notFound('Proyecto');
  if (input === undefined) return materializeProject(project);
  const draft = projectSchema.parse({ ...project, ...projectInputSchema.parse(input) });
  await validateProjectStageExplanations(draft);
  return materializeProject(draft);
}

export async function createProject(input: unknown, actorEmail: string) {
  const parsed = projectInputSchema.parse(input);
  const timestamp = now();
  const id = newId('project');
  const project = projectSchema.parse({
    ...parsed,
    id,
    status: 'draft',
    publishedRevisionId: null,
    publishedAt: null,
    updatedAt: timestamp,
    updatedBy: actorEmail,
  });
  await validateProjectStageExplanations(project);
  await ensureUniqueSlug(project.slug);
  await store().set('projects', id, project);
  await audit('project.created', actorEmail, id, { slug: project.slug });
  return project;
}

export async function updateProject(id: string, input: unknown, actorEmail: string) {
  const existing = await store().get<Project>('projects', id);
  if (!existing) throw notFound('Proyecto');
  const parsed = projectInputSchema.partial().parse(input);
  if (parsed.slug && parsed.slug !== existing.slug && existing.publishedAt) {
    throw new ApiError(409, 'published_slug_locked', 'El slug de un proyecto publicado no puede modificarse');
  }
  if (parsed.slug && parsed.slug !== existing.slug) await ensureUniqueSlug(parsed.slug, id);
  const project = projectSchema.parse({ ...existing, ...parsed, updatedAt: now(), updatedBy: actorEmail });
  await validateProjectStageExplanations(project);
  await store().set('projects', id, project);
  await audit('project.updated', actorEmail, id, { slug: project.slug });
  return project;
}

export async function publishProject(id: string, body: unknown, actorEmail: string) {
  const input = publishInput(body);
  const existing = await store().get<Project>('projects', id);
  if (!existing) throw notFound('Proyecto');
  await validatePublishable(existing);
  const timestamp = now();
  const revisions = (await store().list<ContentRevision>('revisions')).filter((item) => item.projectId === id);
  const latestRevision = [...revisions].sort((left, right) => right.number - left.number)[0];
  const chronologyChanged = hasChronologyChanges(existing, latestRevision?.snapshot);
  if (input.notifyFollowers && !chronologyChanged) {
    throw new ApiError(422, 'notification_requires_chronology_change', 'Sólo se puede notificar a seguidores cuando la cronología cambió respecto de la última publicación');
  }
  const revisionId = newId('revision');
  const project = projectSchema.parse({
    ...existing,
    status: 'published',
    publishedRevisionId: revisionId,
    publishedAt: timestamp,
    updatedAt: timestamp,
    updatedBy: actorEmail,
  });
  const publicProject = await materializeProject(project);
  const revision: ContentRevision = {
    id: revisionId,
    projectId: id,
    number: revisions.length + 1,
    snapshot: project,
    actorEmail,
    createdAt: timestamp,
    changeSummary: input.changeSummary,
    notifyFollowers: input.notifyFollowers,
    restoredFromRevisionId: null,
  };
  const auditEvent = {
    id: newId('audit'), type: 'project.published', actorEmail, targetId: id, createdAt: timestamp,
    details: { revisionId, notifyFollowers: input.notifyFollowers },
  };
  const mailJob = input.notifyFollowers ? {
    id: newId('mail'), type: 'project-update', projectId: id, revisionId, status: 'pending', attempts: 0,
    createdAt: timestamp, updatedAt: timestamp,
  } : undefined;
  await store().publish({ project, publicProject, revision, audit: auditEvent, mailJob });
  await revalidate(project.slug);
  return { project, publicProject, revision };
}

export async function restoreRevision(projectId: string, revisionId: string, actorEmail: string) {
  const revision = await store().get<ContentRevision>('revisions', revisionId);
  if (!revision || revision.projectId !== projectId) throw notFound('Revisión');
  const existing = await store().get<Project>('projects', projectId);
  if (!existing) throw notFound('Proyecto');
  const restored = projectSchema.parse({
    ...revision.snapshot,
    id: projectId,
    slug: existing.slug,
    status: 'draft',
    publishedRevisionId: existing.publishedRevisionId,
    publishedAt: existing.publishedAt,
    updatedAt: now(),
    updatedBy: actorEmail,
  });
  await store().set('projects', projectId, restored);
  await audit('project.revision-restored-to-draft', actorEmail, projectId, { revisionId });
  return restored;
}

export async function changeProjectVisibility(id: string, status: 'unpublished' | 'archived', actorEmail: string) {
  const project = await store().get<Project>('projects', id);
  if (!project) throw notFound('Proyecto');
  const updated = projectSchema.parse({ ...project, status, updatedAt: now(), updatedBy: actorEmail });
  await store().set('projects', id, updated);
  await store().delete('publicProjects', id);
  await audit(`project.${status}`, actorEmail, id, {});
  await revalidate(project.slug);
  return updated;
}

export async function saveLegislator(id: string | null, input: unknown, actorEmail: string) {
  const parsed = legislatorInputSchema.parse(input);
  const targetId = id || newId('legislator');
  const item = legislatorSchema.parse({ ...parsed, id: targetId, updatedAt: now() });
  await ensureUniqueEntitySlug('legislators', item.slug, targetId);
  await store().set('legislators', targetId, item);
  await audit(id ? 'legislator.updated' : 'legislator.created', actorEmail, targetId, {});
  return item;
}

export async function saveGlossaryTerm(id: string | null, input: unknown, actorEmail: string) {
  const parsedInput = glossaryTermInputSchema.parse(input);
  const aliases = [...new Map(parsedInput.aliases.map((alias) => [normalizeGlossaryKey(alias), alias.trim()])).values()]
    .filter((alias) => normalizeGlossaryKey(alias) !== normalizeGlossaryKey(parsedInput.term));
  const parsed = glossaryTermInputSchema.parse({ ...parsedInput, aliases });
  if (parsed.inlineEnabled && !parsed.shortDefinition.trim()) throw new ApiError(422, 'glossary_short_definition_required', 'Completá la definición breve antes de activar el término dentro del texto');
  const targetId = id || newId('term');
  const item = glossaryTermSchema.parse({ ...parsed, id: targetId, updatedBy: actorEmail, updatedAt: now() });
  await ensureUniqueEntitySlug('glossary', item.slug, targetId);
  await ensureUniqueGlossaryKeys(item, targetId);
  await store().set('glossary', targetId, item);
  await audit(id ? 'glossary.updated' : 'glossary.created', actorEmail, targetId, {});
  await revalidate();
  return item;
}

export async function saveCatalog(id: string | null, input: unknown, actorEmail: string) {
  const parsed = catalogItemSchema.parse(input);
  const targetId = id || parsed.id;
  if (id && id !== parsed.id) throw new ApiError(409, 'catalog_key_locked', 'La clave estable del catálogo no puede modificarse');
  await store().set('catalogs', targetId, { ...parsed, id: targetId });
  await audit(id ? 'catalog.updated' : 'catalog.created', actorEmail, targetId, {});
  return { ...parsed, id: targetId };
}

export async function saveWorkflow(id: string | null, input: unknown, actorEmail: string) {
  const parsed = workflowDefinitionSchema.parse(input);
  const existing = id ? await store().get<WorkflowDefinition>('workflows', id) : null;
  if (existing) {
    const nextId = `${slugify(parsed.name)}-v${existing.version + 1}`;
    const version = workflowDefinitionSchema.parse({ ...parsed, id: nextId, version: existing.version + 1, createdAt: now() });
    await store().set('workflows', nextId, version);
    await store().set('workflows', existing.id, { ...existing, active: false });
    await audit('workflow.versioned', actorEmail, nextId, { previousId: existing.id });
    return version;
  }
  await store().set('workflows', parsed.id, parsed);
  await audit('workflow.created', actorEmail, parsed.id, {});
  return parsed;
}

export async function getSettings(): Promise<SiteSettings> {
  const settings = await store().get<SiteSettings>('settings', 'public');
  if (!settings) throw new ApiError(500, 'settings_missing', 'La configuración pública no fue inicializada');
  return siteSettingsSchema.parse(settings);
}

export async function updateSettings(input: unknown, actorEmail: string) {
  const current = await getSettings();
  const parsed = siteSettingsSchema.partial().omit({ id: true, updatedAt: true }).parse(input);
  const next = siteSettingsSchema.parse({ ...current, ...parsed, id: 'public', updatedAt: now() });
  if (next.subscriptionsEnabled && !next.privacyPolicyApproved) {
    throw new ApiError(409, 'privacy_approval_required', 'La política debe estar aprobada antes de habilitar suscripciones');
  }
  const [workflows, catalogs] = await Promise.all([
    store().list<WorkflowDefinition>('workflows'),
    store().list<CatalogItem>('catalogs'),
  ]);
  const explanationKeys = new Set<string>();
  for (const explanation of next.legislativeStageExplanations) {
    const key = [explanation.workflowId, explanation.workflowVersion, explanation.stageId, explanation.chamberId || '*', explanation.initiativeTypeId || '*'].join('::');
    if (explanationKeys.has(key)) throw new ApiError(409, 'stage_explanation_duplicate', 'Ya existe una explicación para esa combinación de flujo, etapa, cámara e iniciativa');
    explanationKeys.add(key);
    const workflow = workflows.find((item) => item.id === explanation.workflowId && item.version === explanation.workflowVersion);
    if (!workflow || !workflow.stages.some((stage) => stage.id === explanation.stageId)) throw new ApiError(409, 'stage_explanation_reference_invalid', 'Una explicación referencia un flujo o una etapa que no existe');
    if (explanation.chamberId && !catalogs.some((item) => item.id === explanation.chamberId && item.kind === 'chamber')) throw new ApiError(409, 'stage_explanation_chamber_invalid', 'Una explicación referencia una cámara que no existe');
    if (explanation.initiativeTypeId && !catalogs.some((item) => item.id === explanation.initiativeTypeId && item.kind === 'initiative')) throw new ApiError(409, 'stage_explanation_initiative_invalid', 'Una explicación referencia un tipo de iniciativa que no existe');
  }
  await store().set('settings', 'public', next);
  await audit('settings.updated', actorEmail, 'public', {});
  await revalidate();
  return next;
}

async function validatePublishable(project: Project) {
  await validateProjectStageExplanations(project);
  if (!project.docketNumber || !project.entryDate || !project.originChamberId || !project.initiativeTypeId) {
    throw new ApiError(422, 'project_incomplete', 'Completá expediente, fecha, cámara e iniciativa antes de publicar');
  }
  if (project.summary.trim().length < 20 || project.impact.trim().length < 20) {
    throw new ApiError(422, 'project_copy_incomplete', 'El resumen y “Cómo me afecta” deben estar completos');
  }
  const workflow = await store().get<WorkflowDefinition>('workflows', project.workflowId);
  const effectiveStageId = effectiveProjectStageId(project);
  if (!workflow || workflow.version !== project.workflowVersion || !workflow.stages.some((stage) => stage.id === effectiveStageId && stage.active)) {
    throw new ApiError(422, 'workflow_invalid', 'El flujo o la etapa seleccionada ya no son válidos');
  }
  const catalogs = await store().list<CatalogItem>('catalogs');
  if (!catalogs.some((item) => item.id === project.originChamberId && item.active) || !catalogs.some((item) => item.id === project.initiativeTypeId && item.active)) {
    throw new ApiError(422, 'catalog_invalid', 'La cámara o iniciativa seleccionada ya no están activas');
  }
}

async function validateProjectStageExplanations(project: Project) {
  if (!project.stageExplanationOverrides?.length) return;
  const workflow = await store().get<WorkflowDefinition>('workflows', project.workflowId);
  if (!workflow || workflow.version !== project.workflowVersion) throw new ApiError(409, 'project_workflow_missing', 'El flujo versionado del proyecto no existe');
  const stageIds = new Set<string>();
  for (const explanation of project.stageExplanationOverrides) {
    if (stageIds.has(explanation.stageId)) throw new ApiError(409, 'project_stage_explanation_duplicate', 'Cada etapa puede tener una sola explicación personalizada por proyecto');
    stageIds.add(explanation.stageId);
    if (!workflow.stages.some((stage) => stage.id === explanation.stageId)) throw new ApiError(409, 'project_stage_explanation_invalid', 'Una explicación personalizada referencia una etapa que no pertenece al flujo del proyecto');
  }
}

async function materializeProject(project: Project): Promise<PublicProject> {
  const [workflow, catalogs, legislators, glossary] = await Promise.all([
    store().get<WorkflowDefinition>('workflows', project.workflowId),
    store().list<CatalogItem>('catalogs'),
    store().list<Legislator>('legislators'),
    store().list<GlossaryTerm>('glossary'),
  ]);
  if (!workflow) throw new ApiError(422, 'workflow_missing', 'El flujo seleccionado no existe');
  const publicLegislators = legislators.filter((item) => item.published);
  const publicGlossary = glossary.map(normalizeGlossaryTerm).filter((item) => item.published);
  const effectiveStageId = effectiveProjectStageId(project);
  return withCanonicalRelations({
    ...project,
    historicalStageId: project.currentStageId,
    currentStageId: effectiveStageId,
    workflow,
    chamber: catalogs.find((item) => item.id === project.originChamberId) || null,
    initiative: catalogs.find((item) => item.id === project.initiativeTypeId) || null,
    author: publicLegislators.find((item) => item.id === project.authorLegislatorId) || null,
    signatories: publicLegislators.filter((item) => project.signatoryIds.includes(item.id)),
    authorAttribution: null,
    signatoryAttributions: [],
    glossary: [],
  }, legislators, publicGlossary);
}

function withCanonicalRelations(project: PublicProject, legislators: Legislator[], glossary: GlossaryTerm[]): PublicProject {
  const withPeople = withLegislatorAttributions(project, legislators);
  const projectTexts = [project.summary, project.impact, ...project.updates.map((item) => item.body)];
  const excludedTerms = new Set(project.glossaryExcludedTermIds || []);
  const automaticGlossary = project.glossaryEnabled === false ? [] : glossary.filter((item) => (
    item.published
    && item.inlineEnabled
    && Boolean(item.shortDefinition.trim())
    && !excludedTerms.has(item.id)
    && glossaryTermAppearsInTexts(item, projectTexts)
  ));
  return {
    ...withPeople,
    currentStageId: effectiveProjectStageId(project),
    glossaryEnabled: project.glossaryEnabled !== false,
    glossaryExcludedTermIds: project.glossaryExcludedTermIds || [],
    glossaryOccurrenceMode: project.glossaryOccurrenceMode || 'all',
    glossaryExcludedOccurrenceIds: project.glossaryExcludedOccurrenceIds || [],
    glossary: automaticGlossary,
  };
}

function withLegislatorAttributions(project: PublicProject, legislators: Legislator[]): PublicProject {
  const byId = new Map(legislators.map((item) => [item.id, item]));
  const author = project.authorLegislatorId ? byId.get(project.authorLegislatorId) : null;
  const signatories = project.signatoryIds.map((id) => byId.get(id)).filter((item): item is Legislator => Boolean(item));
  return {
    ...project,
    author: author?.published ? author : null,
    signatories: signatories.filter((item) => item.published),
    authorAttribution: author ? toPublicAttribution(author) : null,
    signatoryAttributions: signatories.map(toPublicAttribution),
  };
}

function toPublicAttribution(item: Legislator) {
  const { id, slug, fullName, party, bloc, district, office, published } = item;
  return { id, slug, fullName, party, bloc, district, office, published };
}

async function ensureUniqueSlug(slug: string, exceptId = '') {
  const projects = await store().list<Project>('projects');
  if (projects.some((project) => project.slug === slug && project.id !== exceptId)) throw new ApiError(409, 'slug_conflict', 'Ya existe un proyecto con ese slug');
}

async function ensureUniqueEntitySlug(collection: 'legislators' | 'glossary', slug: string, exceptId: string) {
  const items = await store().list<{ id: string; slug: string }>(collection);
  if (items.some((item) => item.slug === slug && item.id !== exceptId)) throw new ApiError(409, 'slug_conflict', 'Ese slug ya está en uso');
}

async function ensureUniqueGlossaryKeys(item: GlossaryTerm, exceptId: string) {
  const ownKeys = new Set([item.term, ...item.aliases].map(normalizeGlossaryKey));
  const glossary = (await store().list<GlossaryTerm>('glossary')).map(normalizeGlossaryTerm);
  for (const candidate of glossary) {
    if (candidate.id === exceptId) continue;
    const conflict = [candidate.term, ...candidate.aliases].find((value) => ownKeys.has(normalizeGlossaryKey(value)));
    if (conflict) throw new ApiError(409, 'glossary_alias_conflict', `“${conflict}” ya identifica el término “${candidate.term}”`);
  }
}

function normalizeGlossaryTerm(item: GlossaryTerm): GlossaryTerm {
  const definition = String(item.definition || '').trim();
  const firstSentence = definition.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || definition.slice(0, 320).trim();
  return glossaryTermSchema.parse({
    ...item,
    shortDefinition: item.shortDefinition || firstSentence.slice(0, 320),
    aliases: item.aliases || [],
    inlineEnabled: item.inlineEnabled === true,
    updatedBy: item.updatedBy || '',
  });
}

function normalizeGlossaryKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function audit(type: string, actorEmail: string, targetId: string, details: Record<string, unknown>) {
  const id = newId('audit');
  await store().set('audits', id, { id, type, actorEmail, targetId, details, createdAt: now() });
}

function publishInput(value: unknown) {
  if (!value || typeof value !== 'object') throw new ApiError(400, 'invalid_body', 'Falta la configuración de publicación');
  const body = value as Record<string, unknown>;
  const changeSummary = String(body.changeSummary || '').trim();
  if (changeSummary.length > 500) throw new ApiError(422, 'invalid_change_summary', 'El resumen del cambio no puede superar los 500 caracteres');
  return { changeSummary, notifyFollowers: body.notifyFollowers === true };
}

async function revalidate(slug = '') {
  const url = process.env.NEXT_REVALIDATE_URL;
  const secret = process.env.NEXT_REVALIDATE_SECRET;
  if (!url || !secret) return;
  await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
    body: JSON.stringify({ slug }),
  }).catch(() => undefined);
}

function sortProjects(left: Project, right: Project) {
  return Number(right.featured) - Number(left.featured) || left.order - right.order || left.title.localeCompare(right.title, 'es');
}
