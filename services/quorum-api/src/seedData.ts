import type { CatalogItem, Project, SiteSettings, WorkflowDefinition } from '@politeia/quorum-contracts';
import { slugify } from '@politeia/quorum-contracts';

export const INITIAL_WORKFLOW_ID = 'legislativo-nacional-v1';
export const SYSTEM_ACTOR = 'sistema@politeia.ar';

export function initialWorkflow(now = new Date().toISOString()): WorkflowDefinition {
  return {
    id: INITIAL_WORKFLOW_ID,
    name: 'Proceso legislativo nacional',
    version: 1,
    active: true,
    createdAt: now,
    stages: [
      { id: 'mesa-de-entrada', label: 'Mesa de entrada', shortLabel: 'Ingreso', description: 'El proyecto fue presentado formalmente.', order: 0, branchFromId: null, terminal: false, active: true },
      { id: 'comisiones', label: 'Tratamiento en comisiones', shortLabel: 'Comisiones', description: 'Las comisiones estudian y debaten el texto.', order: 1, branchFromId: null, terminal: false, active: true },
      { id: 'dictamen', label: 'Dictamen de comisión', shortLabel: 'Dictamen', description: 'La comisión emite su dictamen.', order: 2, branchFromId: null, terminal: false, active: true },
      { id: 'media-sancion', label: 'Media sanción', shortLabel: 'Media sanción', description: 'Una de las cámaras aprobó el proyecto.', order: 3, branchFromId: null, terminal: false, active: true },
      { id: 'sancion-definitiva', label: 'Sanción definitiva', shortLabel: 'Sanción', description: 'Ambas cámaras aprobaron el texto.', order: 4, branchFromId: null, terminal: false, active: true },
      { id: 'promulgacion', label: 'Promulgación', shortLabel: 'Promulgación', description: 'El Poder Ejecutivo promulgó la ley.', order: 5, branchFromId: null, terminal: true, active: true },
      { id: 'veto', label: 'Veto', shortLabel: 'Veto', description: 'El Poder Ejecutivo vetó total o parcialmente el proyecto.', order: 6, branchFromId: 'sancion-definitiva', terminal: true, active: true },
      { id: 'archivado', label: 'Archivado', shortLabel: 'Archivado', description: 'El expediente dejó de estar en tratamiento.', order: 6, branchFromId: 'comisiones', terminal: true, active: true },
    ],
  };
}

export const initialCatalogs: CatalogItem[] = [
  { id: 'diputados', kind: 'chamber', label: 'Cámara de Diputados', description: '', order: 0, active: true },
  { id: 'senado', kind: 'chamber', label: 'Cámara de Senadores', description: '', order: 1, active: true },
  { id: 'poder-ejecutivo', kind: 'initiative', label: 'Poder Ejecutivo', description: '', order: 0, active: true },
  { id: 'poder-legislativo', kind: 'initiative', label: 'Poder Legislativo', description: '', order: 1, active: true },
  { id: 'iniciativa-popular', kind: 'initiative', label: 'Iniciativa Popular', description: '', order: 2, active: true },
];

const initialProjectTitles = [
  'Reforma Electoral Integral',
  'Reforma de la Ley de Salud Mental (Ley 26.657)',
  'Ley Hojarasca',
  'Nueva Ley de Discapacidad “Contra el Fraude de Pensiones por Invalidez”',
  'Ley de Libertad Educativa',
  'Nuevo Super RIGI',
];

export function initialProjects(now = new Date().toISOString()): Project[] {
  return initialProjectTitles.map((title, index) => ({
    id: `seed-${slugify(title)}`,
    slug: slugify(title),
    title,
    docketNumber: '',
    entryDate: null,
    originChamberId: null,
    initiativeTypeId: null,
    workflowId: INITIAL_WORKFLOW_ID,
    workflowVersion: 1,
    currentStageId: 'mesa-de-entrada',
    stageExplanationOverrides: [],
    summary: '',
    summaryFormat: 'plain',
    impact: '',
    impactFormat: 'plain',
    authorLegislatorId: null,
    signatoryIds: [],
    glossaryTermIds: [],
    glossaryEnabled: true,
    glossaryExcludedTermIds: [],
    glossaryOccurrenceMode: 'all',
    glossaryExcludedOccurrenceIds: [],
    documents: [],
    sources: [],
    updates: [],
    featured: index < 3,
    order: index,
    status: 'draft',
    publishedRevisionId: null,
    publishedAt: null,
    updatedAt: now,
    updatedBy: SYSTEM_ACTOR,
  }));
}

export function initialSettings(now = new Date().toISOString()): SiteSettings {
  return {
    id: 'public',
    electionPortal: { enabled: false, title: '', description: '', url: '', label: 'Conocer el proyecto electoral' },
    legislativeStageExplanations: [],
    subscriptionsEnabled: false,
    privacyPolicyApproved: false,
    updatedAt: now,
  };
}
