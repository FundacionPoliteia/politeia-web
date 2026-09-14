import { z } from 'zod';
import { teamMemberInputSchema, type TeamMember, type PublicTeamMember } from '@politeia/quorum-contracts';
import { ApiError } from './errors.js';
import { newId, store } from './store.js';

export async function listTeam() {
  return (await store().list<TeamMember>('teamMembers')).filter(item => item.project === 'quorum')
    .sort((a, b) => a.draft.order - b.draft.order || a.draft.fullName.localeCompare(b.draft.fullName, 'es'));
}
export async function publicTeam(): Promise<PublicTeamMember[]> {
  return (await listTeam()).filter(item => item.published !== null)
    .map(item => ({ ...teamMemberInputSchema.parse(item.published), id: item.id }))
    .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'es'));
}
export async function createTeamMember(input: unknown, actor: string) {
  const draft = teamMemberInputSchema.parse(input);
  const item: TeamMember = { id: newId('member'), project: 'quorum', version: 1, draft,
    published: null, publishedAt: null, updatedAt: new Date().toISOString(), updatedBy: actor };
  return store().set('teamMembers', item.id, item);
}
export async function changeTeamMember(id: string, body: unknown, actor: string, action: 'save' | 'publish' | 'unpublish') {
  const input = (action === 'save'
    ? z.object({ version: z.number().int().positive(), draft: teamMemberInputSchema }).strict()
    : z.object({ version: z.number().int().positive() }).strict()).parse(body);
  const draft = 'draft' in input ? teamMemberInputSchema.parse(input.draft) : null;
  const item = await store().mutateTeamMember(id, current => {
    if (current.project !== 'quorum') throw new ApiError(404, 'member_not_found', 'No encontramos el perfil de Quórum.');
    if (current.version !== input.version) throw new ApiError(409, 'member_changed', 'Otro administrador cambió este perfil. Tus cambios siguen en pantalla; recargá los perfiles para revisar la versión actual.');
    const now = new Date().toISOString();
    return { ...current, version: current.version + 1, updatedAt: now, updatedBy: actor,
      ...(draft ? { draft } : {}),
      ...(action === 'publish' ? { published: teamMemberInputSchema.parse(current.draft), publishedAt: now } : {}),
      ...(action === 'unpublish' ? { published: null, publishedAt: null } : {}),
    };
  });
  if (!item) throw new ApiError(404, 'member_not_found', 'No encontramos el perfil de Quórum.');
  return item;
}
