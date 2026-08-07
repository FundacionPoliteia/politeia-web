import type { GlossaryTerm, Legislator, PublicProject, SiteSettings } from '@politeia/quorum-contracts';

export const publicApiBase = process.env.NEXT_PUBLIC_QUORUM_API_BASE_URL || 'http://localhost:8090';
const serverApiBase = process.env.QUORUM_API_BASE_URL || publicApiBase;
const publicProjectionVersion = 'stage-transitions-v2';

function serverPublicAccessHeaders() {
  const secret = process.env.PUBLIC_ACCESS_GATE_SECRET;
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

export async function fetchPublicBootstrap(): Promise<PublicBootstrap> {
  try {
    const response = await fetch(`${serverApiBase}/v1/public/bootstrap`, { headers: serverPublicAccessHeaders(), next: { revalidate: 300, tags: ['quorum-public'] } });
    if (!response.ok) throw new Error('Public API unavailable');
    return await response.json() as PublicBootstrap;
  } catch {
    return { projects: [], catalogs: [], workflows: [], settings: emptySettings, legislators: [], glossary: [] };
  }
}

export async function fetchPublicProject(slug: string): Promise<PublicProject | null> {
  try {
    const response = await fetch(`${serverApiBase}/v1/public/projects/${encodeURIComponent(slug)}?projection=${publicProjectionVersion}`, { headers: serverPublicAccessHeaders(), next: { revalidate: 300, tags: ['quorum-public', `quorum-project-${slug}`] } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Project API unavailable');
    return (await response.json()).item as PublicProject;
  } catch { return null; }
}

export async function fetchPublicLegislator(slug: string): Promise<Legislator | null> {
  const data = await fetchPublicBootstrap();
  return data.legislators.find((item) => item.slug === slug) || null;
}

export async function fetchGlossaryTerm(slug: string): Promise<GlossaryTerm | null> {
  const data = await fetchPublicBootstrap();
  return data.glossary.find((item) => item.slug === slug) || null;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Pendiente';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
