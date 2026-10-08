import { effectiveProjectStageId, PREPARATION_STAGE_ID, type PublicProject } from '@politeia/quorum-contracts';

export const LEGACY_UNFILED_CHAMBER_ID = 'sin-ingresar-todavia';

export function isProjectAwaitingFormalEntry(project: Pick<PublicProject, 'currentStageId' | 'updates' | 'originChamberId'>) {
  return effectiveProjectStageId(project) === PREPARATION_STAGE_ID || project.originChamberId === LEGACY_UNFILED_CHAMBER_ID;
}
