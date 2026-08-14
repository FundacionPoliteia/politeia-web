import { projectIconNames, type ProjectIconName } from '@politeia/quorum-contracts';

export const projectIconOptions: Array<{ name: ProjectIconName; label: string }> = [
  { name: 'account_balance', label: 'Instituciones' },
  { name: 'how_to_vote', label: 'Elecciones y voto' },
  { name: 'psychology', label: 'Salud mental' },
  { name: 'forest', label: 'Ambiente y naturaleza' },
  { name: 'accessibility_new', label: 'Accesibilidad e inclusión' },
  { name: 'school', label: 'Educación' },
  { name: 'factory', label: 'Industria e inversiones' },
  { name: 'health_and_safety', label: 'Salud pública' },
  { name: 'balance', label: 'Justicia y equilibrio' },
  { name: 'gavel', label: 'Legislación' },
  { name: 'policy', label: 'Políticas públicas' },
  { name: 'campaign', label: 'Participación y debate' },
  { name: 'diversity_3', label: 'Comunidad' },
  { name: 'family_restroom', label: 'Familias' },
  { name: 'social_services', label: 'Protección social' },
  { name: 'payments', label: 'Economía y presupuesto' },
  { name: 'work', label: 'Trabajo' },
  { name: 'security', label: 'Seguridad' },
  { name: 'public', label: 'Relaciones internacionales' },
  { name: 'eco', label: 'Sustentabilidad' },
  { name: 'solar_power', label: 'Energía' },
  { name: 'menu_book', label: 'Cultura y conocimiento' },
  { name: 'apartment', label: 'Desarrollo urbano' },
  { name: 'assured_workload', label: 'Estado y administración' },
];

const iconByKeyword: Array<[RegExp, ProjectIconName]> = [
  [/electoral|voto/i, 'how_to_vote'],
  [/salud mental/i, 'psychology'],
  [/hojarasca|ambient/i, 'forest'],
  [/discapacidad|invalidez/i, 'accessibility_new'],
  [/educativ|educaci/i, 'school'],
  [/rigi|inversi|industr/i, 'factory'],
];

export function projectIcon(project: { icon?: string; title?: string }, index = 0): ProjectIconName {
  if (projectIconNames.includes(project.icon as ProjectIconName)) return project.icon as ProjectIconName;
  return iconByKeyword.find(([pattern]) => pattern.test(project.title || ''))?.[1]
    || projectIconNames[index % projectIconNames.length];
}
