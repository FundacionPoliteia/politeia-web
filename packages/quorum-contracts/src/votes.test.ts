import { describe, it, expect } from 'vitest';
import { emptyVoteCounts, votingResultSchema, type VotingResult } from './votes.js';

const fixture = (): VotingResult => ({ id: 'vote-1', chamber: 'senate', date: '2026-09-08', subject: 'Tratamiento en general', type: 'general', method: 'nominal', outcome: 'pending', counts: { ...emptyVoteCounts(), yes: 2, no: 1 }, sourceUrl: '', notes: '', blocks: [], nominal: [] });
describe('Resultados legislativos', () => {
  it('permite completar parcialmente bloques y personas sin sumar ambos', () => {
    const vote = fixture();
    vote.blocks = [{ name: 'Bloque A', counts: { ...emptyVoteCounts(), yes: 2 } }];
    vote.nominal = [{ legislatorId: 'person-1', name: 'Persona', bloc: 'Bloque A', choice: 'yes' }];
    expect(votingResultSchema.safeParse(vote).success).toBe(true);
  });
  it('rechaza duplicación de personas', () => {
    const vote = fixture(); const person = { legislatorId: 'person-1', name: 'Persona', bloc: '', choice: 'yes' as const };
    vote.nominal = [person, person];
    expect(votingResultSchema.safeParse(vote).success).toBe(false);
  });
  it('rechaza detalle incompatible con el bloque y con los totales', () => {
    const vote = fixture();
    vote.blocks = [{ name: 'Bloque A', counts: emptyVoteCounts() }];
    vote.nominal = [{ legislatorId: 'person-1', name: 'Persona', bloc: 'Bloque A', choice: 'yes' }];
    expect(votingResultSchema.safeParse(vote).success).toBe(false);
    vote.nominal = []; vote.blocks[0].counts.yes = 3;
    expect(votingResultSchema.safeParse(vote).success).toBe(false);
  });
  it('admite resultado por signos sin inventar números', () => {
    const vote = fixture(); vote.counts = null; vote.method = 'showOfHands';
    expect(votingResultSchema.safeParse(vote).success).toBe(true);
  });
});
