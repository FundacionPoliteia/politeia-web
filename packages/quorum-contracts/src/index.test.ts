import { describe, expect, it } from 'vitest';
import { effectiveProjectStageId, glossaryTermAppearsInTexts, hasChronologyChanges, slugify, stageProgress, workflowDefinitionSchema } from './index.js';

const workflow = workflowDefinitionSchema.parse({
  id: 'legislativo-nacional-v1',
  name: 'Proceso legislativo nacional',
  version: 1,
  active: true,
  createdAt: '2026-08-03T12:00:00.000Z',
  stages: [
    { id: 'ingreso', label: 'Mesa de entrada', shortLabel: 'Ingreso', order: 0 },
    { id: 'comisiones', label: 'Tratamiento en comisiones', shortLabel: 'Comisiones', order: 1 },
    { id: 'archivado', label: 'Archivado', shortLabel: 'Archivado', order: 2, branchFromId: 'comisiones', terminal: true },
    { id: 'dictamen', label: 'Dictamen', shortLabel: 'Dictamen', order: 2 },
  ],
});

describe('slugify', () => {
  it('normaliza títulos en español', () => {
    expect(slugify('Reforma de la Ley de Salud Mental')).toBe('reforma-de-la-ley-de-salud-mental');
  });
});

describe('stageProgress', () => {
  it('proyecta una rama sobre su etapa de origen', () => {
    expect(stageProgress(workflow, 'archivado').map((stage) => stage.state)).toEqual(['complete', 'current', 'upcoming']);
  });
});

describe('effectiveProjectStageId', () => {
  it('usa el último cambio de etapa cronológico aunque el array no esté ordenado', () => {
    const project = {
      currentStageId: 'ingreso',
      updates: [
        { id: 'later-note', date: '2026-08-09', title: 'Nota', body: 'Sin cambio', stageId: null, sources: [] },
        { id: 'latest-stage', date: '2026-08-07', title: 'Media sanción', body: 'Avance', stageId: 'media-sancion', sources: [] },
        { id: 'older-stage', date: '2026-08-06', title: 'Dictamen', body: 'Avance', stageId: 'dictamen', sources: [] },
      ],
    };
    expect(effectiveProjectStageId(project)).toBe('media-sancion');
  });

  it('usa la etapa histórica cuando todavía no hay cambios de etapa', () => {
    expect(effectiveProjectStageId({ currentStageId: 'ingreso', updates: [{ id: 'note', date: '2026-08-09', title: 'Nota', body: 'Sin cambio', stageId: null, sources: [] }] })).toBe('ingreso');
  });
});

describe('hasChronologyChanges', () => {
  const update = { id: 'one', date: '2026-08-06', title: 'Dictamen', body: 'La comisión emitió dictamen.', stageId: 'dictamen', sources: [] };

  it('sólo habilita notificaciones cuando existe una revisión anterior y la cronología cambió', () => {
    expect(hasChronologyChanges({ updates: [update] }, null)).toBe(false);
    expect(hasChronologyChanges({ updates: [update] }, { updates: [update] })).toBe(false);
    expect(hasChronologyChanges({ updates: [{ ...update, body: 'Texto actualizado.' }] }, { updates: [update] })).toBe(true);
  });
});

describe('glossaryTermAppearsInTexts', () => {
  const term = { term: 'Media sanción', aliases: ['proyecto con media sancion'] };

  it('detecta términos y alias completos ignorando mayúsculas y tildes', () => {
    expect(glossaryTermAppearsInTexts(term, ['El proyecto obtuvo MEDIA SANCION.'])).toBe(true);
    expect(glossaryTermAppearsInTexts(term, ['Se trata de un proyecto con media sanción del Senado.'])).toBe(true);
  });

  it('no produce coincidencias parciales ni cruza secciones', () => {
    expect(glossaryTermAppearsInTexts({ term: 'ley', aliases: [] }, ['Una leyenda popular.'])).toBe(false);
    expect(glossaryTermAppearsInTexts(term, ['media', 'sanción'])).toBe(false);
  });
});
