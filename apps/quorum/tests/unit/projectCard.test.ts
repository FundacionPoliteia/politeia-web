import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkflowDefinition } from '@politeia/quorum-contracts';
import ProjectStageMovement from '../../components/ProjectStageMovement';

const stages = [
  { id: 'mesa-de-entrada', label: 'Mesa de entrada', shortLabel: 'Ingreso', order: 0, branchFromId: null, terminal: false, active: true },
  { id: 'comisiones', label: 'Comisiones', shortLabel: 'Comisiones', order: 1, branchFromId: null, terminal: false, active: true },
] as WorkflowDefinition['stages'];

function renderMovement(direction: 'forward' | 'backward') {
  return renderToStaticMarkup(createElement(ProjectStageMovement, {
    direction,
    previousStage: stages[direction === 'backward' ? 1 : 0],
    currentStage: stages[direction === 'backward' ? 0 : 1],
  }));
}

describe('señal de movimiento en las cards', () => {
  it('explica con texto el avance y el recorrido entre etapas', () => {
    const markup = renderMovement('forward');
    expect(markup).toContain('Avanzó');
    expect(markup).toContain('Ingreso');
    expect(markup).toContain('Comisiones');
    expect(markup).toContain('aria-label="El proyecto avanzó de Mesa de entrada a Comisiones"');
  });

  it('explica el retroceso sin depender del color', () => {
    const markup = renderMovement('backward');
    expect(markup).toContain('Retrocedió');
    expect(markup).toContain('Comisiones');
    expect(markup).toContain('Ingreso');
    expect(markup).toContain('aria-label="El proyecto retrocedió de Comisiones a Mesa de entrada"');
  });

});
