import { describe, expect, it } from 'vitest';
import { canonicalProjectValue, compareProjectChanges, projectChangeFields, projectInputSchema, projectSchema, summarizeProjectChanges, type ProjectInput } from './index.js';
const base = projectSchema.parse({ id: 'project', title: 'Proyecto de prueba', slug: 'proyecto-prueba', workflowId: 'ley', workflowVersion: 1, currentStageId: 'ingreso', updatedAt: '2026-09-10T00:00:00Z', updatedBy: 'dev@politeia.ar' });
const position = { id: 'one', name: 'Anaa', stance: 'for' as const, role: '', quote: 'A favor del proyecto', sourceLabel: '', sourceUrl: '', date: null };
describe('comparación editorial completa', () => {
  it('detecta una edición válida de cada campo raíz del contrato', () => {
    const replacements = {
      title: 'Título corregido', slug: 'slug-corregido', docketNumber: '1234-D-2026', entryDate: '2026-09-10',
      originChamberId: 'diputados', initiativeTypeId: 'poder-ejecutivo', workflowId: 'otro-proceso', workflowVersion: 2, currentStageId: 'comisiones',
      summary: 'Resumen nuevo', summaryFormat: 'markdown', impact: 'Impacto nuevo', impactFormat: 'markdown',
      authorLegislatorId: 'person', signatoryIds: ['person'], positions: [position],
      votingResults: [{ id: 'v', chamber: 'senate', date: '2026-09-10', subject: 'Votación en general', type: 'general', method: 'showOfHands', outcome: 'approved', counts: null, notes: '', sourceUrl: '', blocks: [], nominal: [] }],
      stageExplanationOverrides: [{ stageId: 'comisiones', summary: 'Explicación específica para este proyecto.', contextualDetail: 'Contexto específico para esta etapa del proyecto.' }],
      glossaryTermIds: ['term'], glossaryEnabled: false, glossaryExcludedTermIds: ['term'], glossaryOccurrenceMode: 'first', glossaryExcludedOccurrenceIds: ['occurrence'],
      documents: [{ id: 'doc', title: 'Documento oficial', kind: 'pdf', url: 'https://example.com/doc.pdf', sourceLabel: '', documentDate: null }],
      sources: [{ id: 'source', label: 'Fuente oficial', url: 'https://example.com', publishedAt: null }],
      updates: [{ id: 'update', date: '2026-09-10', title: 'Nueva etapa', body: 'Entró en comisiones.', stageId: 'comisiones', sources: [] }],
      icon: 'school', featured: true, order: 1,
    } satisfies Required<ProjectInput>;
    for (const [key, value] of Object.entries(replacements)) {
      const current = projectSchema.parse({ ...base, [key]: value });
      expect(compareProjectChanges(current, base).fields.some(field => field.path === key || field.path.startsWith(key + '[')), key).toBe(true);
    }
  });
  it('cubre exactamente todos los campos editables y omite metadatos', () => {
    expect(Object.keys(projectChangeFields).sort()).toEqual(Object.keys(projectInputSchema.shape).sort());
    expect(compareProjectChanges({ ...base, updatedBy: 'info@politeia.ar', updatedAt: '2026-09-11T00:00:00Z', status: 'published' }, base).fields).toEqual([]);
  });
  it('no crea diferencias por orden de claves ni campos opcionales vacíos', () => {
    const previous = { ...base, positions: [position] };
    const current = { ...base, votingResults: [], positions: [Object.fromEntries(Object.entries({ ...position, photoUrl: '' }).reverse()) as typeof position] };
    expect(compareProjectChanges(current, previous).fields).toEqual([]);
    expect(canonicalProjectValue({ b: 2, a: 1 })).toBe(canonicalProjectValue({ a: 1, b: 2 }));
  });
  it('distingue nombre corregido, foto, postura y varias declaraciones nuevas sin perder campos', () => {
    const previous = { ...base, positions: [position] };
    const current = { ...base, positions: [{ ...position, name: 'Ana', photoUrl: 'https://example.com/a.jpg', stance: 'against' as const }, { ...position, id: 'two', name: 'Beto' }, { ...position, id: 'three', name: 'Carla' }] };
    const report = compareProjectChanges(current, previous);
    expect(report.fields.map(f => f.path).sort()).toEqual(['positions[one].name', 'positions[one].stance', 'positions[one].photoUrl', 'positions[two]', 'positions[three]'].sort());
    expect(report.fields.find(f => f.path.endsWith('.name'))).toMatchObject({ before: 'Anaa', after: 'Ana', significant: false });
    expect(report.fields.find(f => f.path.endsWith('.stance'))?.significant).toBe(true);
    expect(report.sections).toEqual(['positions']);
  });
  it('detecta eliminación, reordenamiento y cambios de totales y votos nominales', () => {
    const vote = { id: 'v', chamber: 'deputies' as const, date: '2026-09-10', subject: 'Voto en general', type: 'general' as const, method: 'nominal' as const, outcome: 'pending' as const, counts: { yes: 1, no: 1, abstention: 0, absent: 0, notVoting: 0 }, sourceUrl: '', notes: '', blocks: [], nominal: [{ legislatorId: 'a', name: 'Ana', bloc: 'Bloque', choice: 'yes' as const }] };
    const previous = { ...base, positions: [position, { ...position, id: 'two' }, { ...position, id: 'three' }], votingResults: [vote] };
    const current = { ...base, positions: [previous.positions[2], previous.positions[0]], votingResults: [{ ...vote, counts: { ...vote.counts, yes: 0, no: 2 }, nominal: [{ ...vote.nominal[0], choice: 'no' as const }] }] };
    const report = compareProjectChanges(current, previous);
    expect(report.fields.find(f => f.path === 'positions[two]')?.kind).toBe('removed');
    expect(report.fields.find(f => f.path === 'positions.order')?.kind).toBe('reordered');
    expect(report.fields.find(f => f.path === 'votingResults[v].counts.yes')).toMatchObject({ before: 1, after: 0, significant: true });
    expect(report.fields.find(f => f.path === 'votingResults[v].nominal[a].choice')).toMatchObject({ before: 'yes', after: 'no' });
  });
  it('compara texto enriquecido, formatos, glosario y etapas sin ignorar correcciones pequeñas', () => {
    const current = { ...base, title: 'Proyecto de pruebas', summary: '**Resumen**', summaryFormat: 'markdown' as const, glossaryEnabled: false, currentStageId: 'comisiones' };
    const report = compareProjectChanges(current, base);
    expect(report.sections).toEqual(['identity', 'summary', 'glossary', 'stages']);
    expect(report.fields.find(f => f.path === 'summary')).toMatchObject({ beforeFormat: 'plain', afterFormat: 'markdown' });
    expect(summarizeProjectChanges(report).sections.map(s => s.id)).toEqual(report.sections);
    expect(compareProjectChanges(base).initial).toBe(true);
    expect(compareProjectChanges(base, base).sections).toEqual([]);
  });
});
