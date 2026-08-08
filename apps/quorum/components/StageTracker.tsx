'use client';

import { useMemo, useState } from 'react';
import { stageProgress, type CatalogItem, type LegislativeStageExplanation, type ProjectStageExplanation, type WorkflowDefinition, type WorkflowStage } from '@politeia/quorum-contracts';
import { getLegislativeStageContext } from '@/lib/legislativeStageContext';
import type { StageVisualState } from '@/lib/projectStages';

type StageTrackerProps = {
  workflow: WorkflowDefinition;
  currentStageId: string;
  previousStageId?: string | null;
  chamber: CatalogItem | null;
  initiative: CatalogItem | null;
  visualState: StageVisualState;
  explanations?: LegislativeStageExplanation[];
  projectExplanations?: ProjectStageExplanation[];
};

export default function StageTracker({ workflow, currentStageId, previousStageId = null, chamber, initiative, visualState, explanations = [], projectExplanations = [] }: StageTrackerProps) {
  const progress = useMemo(() => stageProgress(workflow, currentStageId), [workflow, currentStageId]);
  const current = workflow.stages.find((stage) => stage.id === currentStageId);
  const branch = current?.branchFromId ? current : null;
  const [hoveredStageId, setHoveredStageId] = useState<string | null>(null);
  const [pinnedStageId, setPinnedStageId] = useState<string | null>(null);
  const activeStageId = pinnedStageId || hoveredStageId;
  const activeStage = activeStageId ? workflow.stages.find((stage) => stage.id === activeStageId) || null : null;
  const context = activeStage ? getLegislativeStageContext({ stage: activeStage, workflow, chamber, initiative, explanations, projectExplanations }) : null;
  const currentStageIndex = progress.findIndex((stage) => stage.id === currentStageId);
  const previousStageIndex = progress.findIndex((stage) => stage.id === previousStageId);
  const hasDirectionalTransition = (visualState === 'backward' || visualState === 'forward') && currentStageIndex >= 0 && previousStageIndex >= 0;
  const transitionStart = Math.min(currentStageIndex, previousStageIndex);
  const transitionEnd = Math.max(currentStageIndex, previousStageIndex);

  const openStage = (stage: WorkflowStage) => {
    if (!pinnedStageId) setHoveredStageId(stage.id);
  };
  const toggleStage = (stage: WorkflowStage) => {
    setPinnedStageId((selected) => selected === stage.id ? null : stage.id);
    setHoveredStageId(stage.id);
  };
  const close = () => {
    setPinnedStageId(null);
    setHoveredStageId(null);
  };

  return <div
    className={`tracker stage-visual-${visualState}`}
    onMouseLeave={() => { if (!pinnedStageId) setHoveredStageId(null); }}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !pinnedStageId) setHoveredStageId(null);
    }}
    onKeyDownCapture={(event) => { if (event.key === 'Escape') close(); }}
  >
    <div className="tracker-scroll" tabIndex={-1}>
      <div className="tracker-main">
        {progress.map((stage, index) => <button
          type="button"
          className={`track-stage ${stage.state} ${activeStageId === stage.id ? 'explaining' : ''}${hasDirectionalTransition && index >= transitionStart && index < transitionEnd ? ' transition-path' : ''}${hasDirectionalTransition && stage.id === previousStageId ? ' transitioned-from' : ''}`}
          aria-expanded={pinnedStageId === stage.id}
          aria-describedby={activeStageId === stage.id ? 'stage-context-explanation' : undefined}
          aria-label={`Explicar la etapa ${stage.label}`}
          key={stage.id}
          onMouseEnter={() => openStage(stage)}
          onFocus={() => openStage(stage)}
          onClick={() => toggleStage(stage)}
        >
          <span className="track-stage-label">{stage.shortLabel}<span className="stage-info-mark" aria-hidden="true">i</span></span>
        </button>)}
      </div>
    </div>

    <div className={`tracker-help ${context ? 'has-context' : ''}`} aria-live="polite">
      {context && <section className="stage-context-card" id="stage-context-explanation" aria-label={`Explicación de ${context.title}`}>
        <header>
          <div>
            <span className="stage-context-eyebrow">Qué significa en este caso</span>
            <h3>{context.title}</h3>
          </div>
          {pinnedStageId && <button className="stage-context-close" type="button" onClick={close} aria-label="Cerrar explicación">×</button>}
        </header>
        <div className="stage-context-tags" aria-label="Contexto del proyecto">
          <span>Origen: {chamber?.label || 'sin informar'}</span>
          <span>Iniciativa: {initiative?.label || 'sin informar'}</span>
        </div>
        <p className="stage-context-summary">{context.summary}</p>
        <p>{context.contextualDetail}</p>
        {context.alert && <p className="stage-context-alert"><strong>Dato a revisar:</strong> {context.alert}</p>}
        <footer>
          <span>Fuentes oficiales</span>
          <div>{context.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.label}<span aria-hidden="true">↗</span></a>)}</div>
        </footer>
      </section>}
    </div>

    {branch && <button
      type="button"
      className={`branch-status ${activeStageId === branch.id ? 'explaining' : ''}`}
      aria-expanded={pinnedStageId === branch.id}
      aria-describedby={activeStageId === branch.id ? 'stage-context-explanation' : undefined}
      onMouseEnter={() => openStage(branch)}
      onFocus={() => openStage(branch)}
      onClick={() => toggleStage(branch)}
    >Desenlace: {branch.label}<span className="stage-info-mark" aria-hidden="true">i</span></button>}
  </div>;
}
