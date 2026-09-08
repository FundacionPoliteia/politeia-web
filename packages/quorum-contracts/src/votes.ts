import { z } from 'zod';

export const voteChoices = ['yes', 'no', 'abstention', 'absent', 'notVoting'] as const;
export const voteLabels: Record<typeof voteChoices[number], string> = { yes: 'A favor', no: 'En contra', abstention: 'Abstenciones', absent: 'Ausentes', notVoting: 'No votó' };
const count = z.number().int().min(0).max(1000);
export const voteCountsSchema = z.object({ yes: count, no: count, abstention: count, absent: count, notVoting: count });
export type VoteCounts = z.infer<typeof voteCountsSchema>;
export const emptyVoteCounts = (): VoteCounts => ({ yes: 0, no: 0, abstention: 0, absent: 0, notVoting: 0 });
export const votingResultSchema = z.object({
  id: z.string().min(1),
  chamber: z.enum(['deputies', 'senate']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value; }, 'Fecha de votación inválida'),
  subject: z.string().trim().min(3).max(300),
  type: z.enum(['general', 'particular', 'motion', 'unspecified']),
  method: z.enum(['nominal', 'aggregate', 'showOfHands']),
  outcome: z.enum(['approved', 'rejected', 'pending']),
  counts: voteCountsSchema.nullable(),
  sourceUrl: z.union([z.literal(''), z.string().url().refine(v => /^https?:\/\//i.test(v), 'Usá una URL HTTP o HTTPS')]),
  notes: z.string().trim().max(2000),
  majorityRule: z.string().trim().max(500).optional(),
  official: z.object({ snapshotId: z.string().regex(/^[a-f0-9]{64}$/), sourceUrl: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/), overriddenFields: z.array(z.string()).max(20) }).optional(),
  blocks: z.array(z.object({ name: z.string().trim().min(1).max(150), counts: voteCountsSchema })).max(200),
  nominal: z.array(z.object({ legislatorId: z.string().min(1), name: z.string().trim().min(1).max(200), bloc: z.string().trim().max(150), choice: z.enum(voteChoices) })).max(1000),
}).superRefine((vote, ctx) => {
  if (new Set(vote.blocks.map(b => b.name.toLocaleLowerCase('es'))).size !== vote.blocks.length) ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'No repitas un bloque en la misma votación' });
  if (new Set(vote.nominal.map(n => n.legislatorId)).size !== vote.nominal.length) ctx.addIssue({ code: 'custom', path: ['nominal'], message: 'Una persona sólo puede tener un voto por votación' });
  if (!vote.counts && (vote.blocks.length || vote.nominal.length)) ctx.addIssue({ code: 'custom', path: ['counts'], message: 'Cargá los totales antes de agregar el detalle' });
  if (vote.counts) for (const choice of voteChoices) {
    if (vote.blocks.reduce((n, b) => n + b.counts[choice], 0) > vote.counts[choice]) ctx.addIssue({ code: 'custom', path: ['blocks'], message: `El detalle por bloques supera el total de ${voteLabels[choice]}` });
    if (vote.nominal.filter(n => n.choice === choice).length > vote.counts[choice]) ctx.addIssue({ code: 'custom', path: ['nominal'], message: `El detalle nominal supera el total de ${voteLabels[choice]}` });
    for (const block of vote.blocks) if (vote.nominal.filter(n => n.bloc === block.name && n.choice === choice).length > block.counts[choice]) ctx.addIssue({ code: 'custom', path: ['nominal'], message: `Los votos nominales superan lo cargado para ${block.name}` });
  }
});
export type VotingResult = z.infer<typeof votingResultSchema>;

export const votingEditableFields = ['chamber', 'date', 'subject', 'type', 'method', 'outcome', 'counts', 'blocks', 'nominal', 'sourceUrl', 'notes', 'majorityRule'] as const;
export function votingOverrides(current: VotingResult, original: VotingResult): string[] {
  return votingEditableFields.filter(field => JSON.stringify(current[field] ?? null) !== JSON.stringify(original[field] ?? null));
}
