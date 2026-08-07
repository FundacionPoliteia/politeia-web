import { describe, expect, it } from 'vitest';
import type { CatalogItem, WorkflowStage } from '@politeia/quorum-contracts';
import { getLegislativeStageContext } from '../../lib/legislativeStageContext';

const stage = (id: string, label: string): WorkflowStage => ({
  id,
  label,
  shortLabel: label,
  description: '',
  order: 0,
  branchFromId: null,
  terminal: false,
  active: true,
});
const chamber = (id: string, label: string): CatalogItem => ({ id, label, kind: 'chamber', description: '', order: 0, active: true });
const initiative = (id: string, label: string): CatalogItem => ({ id, label, kind: 'initiative', description: '', order: 0, active: true });

describe('contexto legislativo de cada etapa', () => {
  it('explica el control especial de una iniciativa popular en comisiones', () => {
    const context = getLegislativeStageContext({
      stage: stage('comisiones', 'Tratamiento en comisiones'),
      chamber: chamber('diputados', 'Cámara de Diputados'),
      initiative: initiative('iniciativa-popular', 'Iniciativa popular'),
    });
    expect(context.contextualDetail).toContain('Asuntos Constitucionales');
    expect(context.contextualDetail).toContain('20 días hábiles');
    expect(context.contextualDetail).toContain('12 meses');
  });

  it('no inventa un circuito general distinto para proyectos del Ejecutivo', () => {
    const context = getLegislativeStageContext({
      stage: stage('comisiones', 'Tratamiento en comisiones'),
      chamber: chamber('senado', 'Cámara de Senadores'),
      initiative: initiative('poder-ejecutivo', 'Poder Ejecutivo'),
    });
    expect(context.contextualDetail).toContain('no crea, por sí solo');
    expect(context.contextualDetail).toContain('según la materia');
  });

  it('nombra la cámara revisora según el origen', () => {
    const context = getLegislativeStageContext({
      stage: stage('media-sancion', 'Media sanción'),
      chamber: chamber('senado', 'Cámara de Senadores'),
      initiative: initiative('poder-legislativo', 'Poder Legislativo'),
    });
    expect(context.contextualDetail).toContain('Cámara de Diputados');
  });

  it('advierte una combinación inválida entre iniciativa popular y origen en Senado', () => {
    const context = getLegislativeStageContext({
      stage: stage('mesa-de-entrada', 'Mesa de entrada'),
      chamber: chamber('senado', 'Cámara de Senadores'),
      initiative: initiative('iniciativa-popular', 'Iniciativa popular'),
    });
    expect(context.alert).toContain('origen constitucional obligatorio en Diputados');
  });

  it('prioriza la variante editorial más específica', () => {
    const workflow = { id: 'legislativo-v1', version: 1 };
    const context = getLegislativeStageContext({
      stage: stage('comisiones', 'Tratamiento en comisiones'), workflow,
      chamber: chamber('diputados', 'Cámara de Diputados'),
      initiative: initiative('iniciativa-popular', 'Iniciativa popular'),
      explanations: [
        { workflowId: workflow.id, workflowVersion: 1, stageId: 'comisiones', chamberId: null, initiativeTypeId: null, summary: 'Explicación general suficientemente extensa.', contextualDetail: 'Detalle general suficientemente extenso para validar.' },
        { workflowId: workflow.id, workflowVersion: 1, stageId: 'comisiones', chamberId: 'diputados', initiativeTypeId: 'iniciativa-popular', summary: 'Explicación específica suficientemente extensa.', contextualDetail: 'Detalle específico suficientemente extenso para validar.' },
      ],
    });
    expect(context.summary).toBe('Explicación específica suficientemente extensa.');
    expect(context.contextualDetail).toBe('Detalle específico suficientemente extenso para validar.');
  });

  it('hace prevalecer la excepción del proyecto sobre la configuración general', () => {
    const workflow = { id: 'legislativo-v1', version: 1 };
    const context = getLegislativeStageContext({
      stage: stage('dictamen', 'Dictamen'), workflow,
      chamber: chamber('diputados', 'Cámara de Diputados'),
      initiative: initiative('poder-legislativo', 'Poder Legislativo'),
      explanations: [{ workflowId: workflow.id, workflowVersion: 1, stageId: 'dictamen', chamberId: null, initiativeTypeId: null, summary: 'Resumen editorial general suficientemente extenso.', contextualDetail: 'Detalle editorial general suficientemente extenso.' }],
      projectExplanations: [{ stageId: 'dictamen', summary: 'Resumen excepcional del proyecto suficientemente extenso.', contextualDetail: 'Detalle excepcional del proyecto suficientemente extenso.' }],
    });
    expect(context.summary).toBe('Resumen excepcional del proyecto suficientemente extenso.');
    expect(context.contextualDetail).toBe('Detalle excepcional del proyecto suficientemente extenso.');
  });
});
