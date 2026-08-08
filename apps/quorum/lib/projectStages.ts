import type { PublicProject, WorkflowDefinition } from '@politeia/quorum-contracts';

export type StageVisualState = 'normal' | 'forward' | 'backward' | 'closed' | 'promulgated';

export type ProjectStageTransition = {
  currentStageId: string;
  previousStageId: string | null;
  state: StageVisualState;
};

export function chronologyStageTransitions(project: Pick<PublicProject, 'currentStageId' | 'historicalStageId' | 'updates' | 'workflow'>) {
  const result = new Map<string, ProjectStageTransition>();
  let previousStageId: string | null = project.historicalStageId || project.currentStageId;
  const ordered = project.updates.map((update, index) => ({ update, index }))
    .sort((left, right) => left.update.date.localeCompare(right.update.date) || left.index - right.index);
  for (const { update } of ordered) {
    if (!update.stageId) continue;
    const state = stageVisualState(project.workflow, update.stageId, previousStageId);
    result.set(update.id, { currentStageId: update.stageId, previousStageId, state });
    previousStageId = update.stageId;
  }
  return result;
}

export function chronologyStageVisuals(project: Pick<PublicProject, 'currentStageId' | 'historicalStageId' | 'updates' | 'workflow'>) {
  return new Map([...chronologyStageTransitions(project)].map(([id, transition]) => [id, transition.state]));
}

export function projectStageVisualState(project: Pick<PublicProject, 'currentStageId' | 'historicalStageId' | 'updates' | 'workflow'>): StageVisualState {
  return latestProjectStageTransition(project)?.state || stageVisualState(project.workflow, project.currentStageId, null);
}

export function latestProjectStageTransition(project: Pick<PublicProject, 'currentStageId' | 'historicalStageId' | 'updates' | 'workflow'>): ProjectStageTransition | null {
  const transitions = chronologyStageTransitions(project);
  const latestStageUpdate = project.updates.map((update, index) => ({ update, index }))
    .filter(({ update }) => Boolean(update.stageId))
    .sort((left, right) => right.update.date.localeCompare(left.update.date) || right.index - left.index)[0]?.update;
  return latestStageUpdate ? transitions.get(latestStageUpdate.id) || null : null;
}

function stageVisualState(workflow: WorkflowDefinition, stageId: string, previousStageId: string | null): StageVisualState {
  const stage = workflow.stages.find((item) => item.id === stageId);
  if (!stage) return 'normal';
  const normalized = `${stage.id} ${stage.label}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('promulg')) return 'promulgated';
  if (stage.terminal) return 'closed';
  if (!previousStageId) return 'normal';
  const previous = workflow.stages.find((item) => item.id === previousStageId);
  if (!previous) return 'normal';
  const currentRank = stageRank(workflow, stage);
  const previousRank = stageRank(workflow, previous);
  if (currentRank < previousRank) return 'backward';
  if (currentRank > previousRank) return 'forward';
  return 'normal';
}

function stageRank(workflow: WorkflowDefinition, stage: WorkflowDefinition['stages'][number]) {
  if (!stage.branchFromId) return stage.order;
  return workflow.stages.find((item) => item.id === stage.branchFromId)?.order ?? stage.order;
}
