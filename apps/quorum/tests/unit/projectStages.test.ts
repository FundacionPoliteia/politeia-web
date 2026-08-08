import { describe, expect, it } from 'vitest';
import type { PublicProject, WorkflowDefinition } from '@politeia/quorum-contracts';
import { chronologyStageVisuals, projectStageVisualState } from '../../lib/projectStages';

const workflow = { stages: [
  { id: 'ingreso', label: 'Ingreso', shortLabel: 'Ingreso', order: 0, branchFromId: null, terminal: false, active: true },
  { id: 'comisiones', label: 'Comisiones', shortLabel: 'Comisiones', order: 1, branchFromId: null, terminal: false, active: true },
  { id: 'dictamen', label: 'Dictamen', shortLabel: 'Dictamen', order: 2, branchFromId: null, terminal: false, active: true },
  { id: 'promulgacion', label: 'Promulgación', shortLabel: 'Promulgación', order: 3, branchFromId: null, terminal: true, active: true },
  { id: 'archivado', label: 'Archivado', shortLabel: 'Archivado', order: 4, branchFromId: 'comisiones', terminal: true, active: true },
] } as WorkflowDefinition;

function project(updates: PublicProject['updates'], currentStageId = 'dictamen') {
  return { workflow, updates, currentStageId };
}

describe('señales visuales de etapa', () => {
  it('detecta un retroceso entre cambios cronológicos consecutivos', () => {
    const visuals = chronologyStageVisuals(project([
      { id: 'one', date: '2026-08-01', title: 'Dictamen', body: 'Avance', stageId: 'dictamen', sources: [] },
      { id: 'two', date: '2026-08-02', title: 'Vuelve', body: 'Retroceso', stageId: 'comisiones', sources: [] },
    ]));
    expect(visuals.get('two')).toBe('backward');
  });

  it('detecta un retroceso desde la etapa histórica en la primera actualización', () => {
    const visuals = chronologyStageVisuals(project([
      { id: 'first', date: '2026-08-01', title: 'Vuelve a comisión', body: 'Se retomó el tratamiento.', stageId: 'comisiones', sources: [] },
    ], 'dictamen'));
    expect(visuals.get('first')).toBe('backward');
    expect(projectStageVisualState(project([
      { id: 'first', date: '2026-08-01', title: 'Vuelve a comisión', body: 'Se retomó el tratamiento.', stageId: 'comisiones', sources: [] },
    ], 'dictamen'))).toBe('backward');
  });

  it('distingue visualmente un avance desde la etapa histórica', () => {
    const advanced = project([
      { id: 'advance', date: '2026-08-01', title: 'Llega a dictamen', body: 'La comisión emitió dictamen.', stageId: 'dictamen', sources: [] },
    ], 'ingreso');
    expect(chronologyStageVisuals(advanced).get('advance')).toBe('forward');
    expect(projectStageVisualState(advanced)).toBe('forward');
  });

  it('distingue cierre y promulgación', () => {
    expect(projectStageVisualState(project([{ id: 'closed', date: '2026-08-02', title: 'Archivo', body: 'Cierre', stageId: 'archivado', sources: [] }], 'archivado'))).toBe('closed');
    expect(projectStageVisualState(project([{ id: 'law', date: '2026-08-02', title: 'Promulgada', body: 'Ley', stageId: 'promulgacion', sources: [] }], 'promulgacion'))).toBe('promulgated');
  });
});
