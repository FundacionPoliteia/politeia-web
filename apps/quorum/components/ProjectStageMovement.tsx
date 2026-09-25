import type { WorkflowDefinition } from '@politeia/quorum-contracts';
import React from 'react';

type WorkflowStage = WorkflowDefinition['stages'][number];

export default function ProjectStageMovement({ direction, previousStage, currentStage }: {
  direction: 'forward' | 'backward';
  previousStage: WorkflowStage;
  currentStage: WorkflowStage;
}) {
  const isBackward = direction === 'backward';
  return <div className={'stage-movement stage-movement-' + direction} role="group" aria-label={`El proyecto ${isBackward ? 'retrocedió' : 'avanzó'} de ${previousStage.label} a ${currentStage.label}`}>
    <span className="stage-movement-direction"><span aria-hidden="true">{isBackward ? '↶' : '↗'}</span>{isBackward ? 'Retrocedió' : 'Avanzó'}</span>
    <span className="stage-movement-route"><span>{previousStage.shortLabel || previousStage.label}</span><span className="stage-movement-arrow" aria-hidden="true">→</span><strong>{currentStage.shortLabel || currentStage.label}</strong></span>
  </div>;
}
