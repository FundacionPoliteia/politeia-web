import type { Legislator } from '@politeia/quorum-contracts';

export type ChamberLegislator = Pick<Legislator, 'id' | 'fullName' | 'office'>;

export function isDeputyOrSenator(legislator: Pick<Legislator, 'office'>) {
  return legislator.office === 'diputado' || legislator.office === 'senador';
}

export function normalizeLegislatorSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function exactLegislatorMatch<T extends ChamberLegislator>(name: string, legislators: readonly T[], legislatorId?: string | null) {
  const exactMatches = legislators.filter((legislator) => isDeputyOrSenator(legislator) && name.trim().normalize('NFC') === legislator.fullName.trim().normalize('NFC'));
  if (legislatorId) return exactMatches.find((legislator) => legislator.id === legislatorId);
  return exactMatches.length === 1 ? exactMatches[0] : undefined;
}
