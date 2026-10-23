import type { GlossaryTerm, Legislator, PublicProject, SiteSettings } from '@politeia/quorum-contracts';

export const publicApiBase = process.env.NEXT_PUBLIC_QUORUM_API_BASE_URL || 'http://localhost:8090';
const serverApiBase = process.env.QUORUM_API_BASE_URL || publicApiBase;
const publicProjectionVersion = 'stage-transitions-v2';

export async function fetchPublicTeam(): Promise<import('@politeia/quorum-contracts').PublicTeamMember[]> {
  const response = await fetch(`${serverApiBase}/v1/public/team`, { headers: serverPublicAccessHeaders(), cache: 'no-store' });
  if (!response.ok) throw new Error('No pudimos cargar el equipo de Quórum.');
  const body = await response.json();
  if (!Array.isArray(body.items)) throw new Error('Respuesta de equipo inválida.');
  return body.items;
}

function serverPublicAccessHeaders() {
  const secret = process.env.PUBLIC_ACCESS_GATE_SECRET?.trim();
  return secret ? { 'x-quorum-public-access-key': secret } : undefined;
}

export interface PublicBootstrap {
  projects: PublicProject[];
  catalogs: Array<{ id: string; kind: 'chamber' | 'initiative'; label: string; active: boolean; order: number }>;
  workflows: PublicProject['workflow'][];
  settings: SiteSettings;
  legislators: Legislator[];
  glossary: GlossaryTerm[];
}

const emptySettings: SiteSettings = {
  id: 'public', electionPortal: { enabled: false, title: '', description: '', url: '', label: 'Conocer el proyecto electoral' },
  legislativeStageExplanations: [],
  subscriptionsEnabled: false, privacyPolicyApproved: false, updatedAt: new Date(0).toISOString(),
};

export async function fetchPublicBootstrap(options: { fresh?: boolean; throwOnError?: boolean } = {}): Promise<PublicBootstrap> {
  try {
    const requestOptions = options.fresh
      ? { headers: serverPublicAccessHeaders(), cache: 'no-store' as const }
      : { headers: serverPublicAccessHeaders(), next: { revalidate: 300, tags: ['quorum-public'] } };
    const response = await fetch(`${serverApiBase}/v1/public/bootstrap`, requestOptions);
    if (!response.ok) throw new Error('Public API unavailable');
    const data = await response.json() as Partial<PublicBootstrap> | null;
    if (!data || !Array.isArray(data.projects) || !Array.isArray(data.catalogs) || !Array.isArray(data.workflows)
      || !data.settings || !Array.isArray(data.legislators) || !Array.isArray(data.glossary)) {
      throw new Error('Public API returned an invalid bootstrap response');
    }
    return data as PublicBootstrap;
  } catch (error) {
    if (options.throwOnError) throw error;
    return { projects: [], catalogs: [], workflows: [], settings: emptySettings, legislators: [], glossary: [] };
  }
}

export async function fetchPublicProject(slug: string): Promise<PublicProject | null> {
  const response = await fetch(`${serverApiBase}/v1/public/projects/${encodeURIComponent(slug)}?projection=${publicProjectionVersion}`, { headers: serverPublicAccessHeaders(), cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Project API unavailable');
  const body = await response.json() as { item?: PublicProject } | null;
  if (!body?.item || body.item.slug !== slug) throw new Error('Project API returned an invalid project response');
  return body.item;
}

export async function fetchPublicLegislator(slug: string): Promise<Legislator | null> {
  const data = await fetchPublicBootstrap({ fresh: true, throwOnError: true });
  return data.legislators.find((item) => item.slug === slug) || null;
}

export async function fetchGlossaryTerm(slug: string): Promise<GlossaryTerm | null> {
  const data = await fetchPublicBootstrap({ fresh: true, throwOnError: true });
  return data.glossary.find((item) => item.slug === slug) || null;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Pendiente';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
