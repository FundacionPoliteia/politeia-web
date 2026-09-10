import { z } from 'zod';
import { projectSchema, type Project, type ProjectInput } from './index.js';

export const changeSectionIds = ['identity', 'presentation', 'summary', 'impact', 'people', 'votes', 'positions', 'sources', 'documents', 'chronology', 'glossary', 'stages'] as const;
export type ChangeSectionId = typeof changeSectionIds[number];
export const changeSections: Record<ChangeSectionId, string> = {
  identity: 'Datos básicos', presentation: 'Presentación', summary: 'Resumen', impact: '¿Cómo me afecta?',
  people: 'Autoría y firmantes', votes: 'Resultado de votaciones', positions: 'A favor / En contra',
  sources: 'Fuentes', documents: 'Documentos', chronology: 'Cronología', glossary: 'Glosario', stages: 'Etapas y explicaciones',
};
type FieldInfo = { section: ChangeSectionId; label: string };
// Exhaustive by contract: adding an editable field requires assigning its comparison section.
export const projectChangeFields = {
  title: { section: 'identity', label: 'Título' }, slug: { section: 'identity', label: 'Slug' },
  docketNumber: { section: 'identity', label: 'Expediente' }, entryDate: { section: 'identity', label: 'Fecha de ingreso' },
  originChamberId: { section: 'identity', label: 'Cámara de origen' }, initiativeTypeId: { section: 'identity', label: 'Iniciativa' },
  workflowId: { section: 'stages', label: 'Proceso legislativo' }, workflowVersion: { section: 'stages', label: 'Versión del proceso' },
  currentStageId: { section: 'stages', label: 'Etapa inicial o histórica' }, stageExplanationOverrides: { section: 'stages', label: 'Explicaciones personalizadas' },
  summary: { section: 'summary', label: 'Resumen' }, summaryFormat: { section: 'summary', label: 'Formato' },
  impact: { section: 'impact', label: 'Impacto' }, impactFormat: { section: 'impact', label: 'Formato' },
  authorLegislatorId: { section: 'people', label: 'Autoría' }, signatoryIds: { section: 'people', label: 'Firmantes' },
  votingResults: { section: 'votes', label: 'Votaciones' }, positions: { section: 'positions', label: 'Declaraciones' },
  glossaryTermIds: { section: 'glossary', label: 'Términos asociados' }, glossaryEnabled: { section: 'glossary', label: 'Glosario habilitado' },
  glossaryExcludedTermIds: { section: 'glossary', label: 'Términos excluidos' }, glossaryOccurrenceMode: { section: 'glossary', label: 'Repetición de términos' },
  glossaryExcludedOccurrenceIds: { section: 'glossary', label: 'Instancias excluidas' },
  sources: { section: 'sources', label: 'Fuentes' }, documents: { section: 'documents', label: 'Documentos' },
  updates: { section: 'chronology', label: 'Actualizaciones' }, icon: { section: 'presentation', label: 'Ícono' },
  featured: { section: 'presentation', label: 'Destacado' }, order: { section: 'presentation', label: 'Orden' },
} satisfies Record<keyof ProjectInput, FieldInfo>;

export type ChangeKind = 'added' | 'removed' | 'modified' | 'reordered';
export type ProjectFieldChange = {
  path: string; label: string; section: ChangeSectionId; kind: ChangeKind;
  before: unknown; after: unknown; significant: boolean;
  beforeFormat?: 'plain' | 'markdown'; afterFormat?: 'plain' | 'markdown';
};
export type ProjectChangeReport = { initial: boolean; fields: ProjectFieldChange[]; sections: ChangeSectionId[]; significant: boolean };
export const projectChangeSummarySchema = z.object({
  version: z.literal(1), initial: z.boolean(), significant: z.boolean(),
  sections: z.array(z.object({ id: z.enum(changeSectionIds), fields: z.array(z.string()), significant: z.boolean() })),
});
export type ProjectChangeSummary = z.infer<typeof projectChangeSummarySchema>;

export const projectChangeLabels: Record<string, string> = {
  name: 'Nombre', title: 'Título', role: 'Cargo o espacio político', photoUrl: 'Foto', stance: 'Postura', quote: 'Declaración',
  date: 'Fecha', body: 'Explicación pública', stageId: 'Etapa', showStageChange: 'Mostrar cambio de etapa', sources: 'Fuentes',
  sourceLabel: 'Nombre de la fuente', sourceUrl: 'Enlace a la fuente', url: 'URL', label: 'Nombre', publishedAt: 'Fecha de la fuente',
  chamber: 'Cámara', subject: 'Asunto', type: 'Tipo de votación', method: 'Método', outcome: 'Resultado',
  counts: 'Totales', yes: 'A favor', no: 'En contra', abstention: 'Abstenciones', absent: 'Ausentes', notVoting: 'No votaron',
  blocks: 'Bloques', nominal: 'Votos nominales', legislatorId: 'Legislador/a', bloc: 'Bloque', choice: 'Voto',
  notes: 'Notas', majorityRule: 'Regla de mayoría', official: 'Procedencia oficial', snapshotId: 'Acta importada',
  sha256: 'Huella del acta', overriddenFields: 'Campos editados manualmente', kind: 'Tipo', documentDate: 'Fecha del documento',
  summary: 'Explicación breve', contextualDetail: 'Detalle contextual',
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function canonicalProjectValue(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalProjectValue).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalProjectValue(value[key])).join(',') + '}';
  return JSON.stringify(value ?? null);
}
function normalize(value: unknown, key = ''): unknown {
  if (key === 'photoUrl' || key === 'majorityRule') return value ?? '';
  if (key === 'showStageChange') return value ?? true;
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (object(value)) {
    const result = Object.fromEntries(Object.entries(value).map(([field, item]) => [field, normalize(item, field)]));
    if ('quote' in value) result.photoUrl ??= '';
    if ('counts' in value && 'chamber' in value) result.majorityRule ??= '';
    if ('stageId' in value && 'body' in value) result.showStageChange ??= true;
    return result;
  }
  return value ?? null;
}
const rootKeys = Object.keys(projectChangeFields) as Array<keyof ProjectInput>;
export function comparableProject(project: Project) {
  const parsed = projectSchema.parse(project);
  return Object.fromEntries(rootKeys.map((key) => [key, normalize(parsed[key] ?? (key === 'positions' || key === 'votingResults' ? [] : null))]));
}
export function compareProjectChanges(current: Project, published?: Project | null): ProjectChangeReport {
  const next = comparableProject(current);
  const previous = published ? comparableProject(published) : {};
  const fields: ProjectFieldChange[] = [];
  function walk(before: unknown, after: unknown, path: string, label: string, section: ChangeSectionId) {
    if (canonicalProjectValue(before) === canonicalProjectValue(after)) return;
    const push = (kind: ChangeKind, oldValue = before, newValue = after, suffix = '') => {
      const significant = kind !== 'reordered' && (
        ['votes', 'chronology', 'people'].includes(section) ||
        (section === 'positions' && (kind !== 'modified' || /\.(quote|stance)$/.test(path))) ||
        /^(originChamberId|initiativeTypeId|currentStageId|workflowId|workflowVersion)$/.test(path)
      );
      fields.push({ path: path + suffix, label: label + (suffix ? ' · Orden' : ''), section, kind, before: oldValue ?? null, after: newValue ?? null, significant,
        ...(path === 'summary' || path === 'impact' ? { beforeFormat: published?.[path === 'summary' ? 'summaryFormat' : 'impactFormat'] || 'plain', afterFormat: current[path === 'summary' ? 'summaryFormat' : 'impactFormat'] } : {}),
      });
    };
    if (Array.isArray(before) && Array.isArray(after)) {
      const all = [...before, ...after];
      const key = ['id', 'legislatorId', 'stageId', 'name'].find((candidate) =>
        all.length > 0 && all.every((item) => object(item) && typeof item[candidate] === 'string') &&
        [before, after].every((list) => new Set(list.map((item) => item[candidate])).size === list.length));
      if (key) {
        const oldItems = new Map(before.map((item) => [item[key], item]));
        const newItems = new Map(after.map((item) => [item[key], item]));
        for (const id of new Set([...oldItems.keys(), ...newItems.keys()])) {
          const oldItem = oldItems.get(id), newItem = newItems.get(id), item = newItem || oldItem;
          const caption = item.name || item.title || item.subject || item.label || item.stageId || id;
          walk(oldItem, newItem, path + '[' + id + ']', label + ' · ' + caption, section);
        }
        const oldOrder = before.map((item) => item[key]).filter((id) => newItems.has(id));
        const newOrder = after.map((item) => item[key]).filter((id) => oldItems.has(id));
        if (canonicalProjectValue(oldOrder) !== canonicalProjectValue(newOrder)) push('reordered', oldOrder, newOrder, '.order');
        return;
      }
    }
    if (object(before) && object(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        walk(before[key], after[key], path + '.' + key, label + ' · ' + (projectChangeLabels[key] || key), section);
      }
      return;
    }
    if (before == null && (after == null || after === '' || (Array.isArray(after) && after.length === 0))) return;
    push(before == null ? 'added' : after == null ? 'removed' : 'modified');
  }
  for (const key of rootKeys) {
    const info = projectChangeFields[key];
    walk(previous[key], next[key], key, info.label, info.section);
  }
  const sections = changeSectionIds.filter((section) => fields.some((field) => field.section === section));
  return { initial: !published, fields, sections, significant: fields.some((field) => field.significant) };
}
export function summarizeProjectChanges(report: ProjectChangeReport): ProjectChangeSummary {
  return { version: 1, initial: report.initial, significant: report.significant, sections: report.sections.map((id) => ({
    id, fields: report.fields.filter((field) => field.section === id).map((field) => field.path),
    significant: report.fields.some((field) => field.section === id && field.significant),
  })) };
}
