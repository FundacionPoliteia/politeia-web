import type { MetadataRoute } from 'next';
import { fetchPublicBootstrap } from '@/lib/api';

// Public editorial content is managed after builds; keep the sitemap fresh
// and expose dynamic profile and glossary routes to search engines.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.PUBLIC_ACCESS_REQUIRED === 'true') return [];

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://quorum.politeia.ar';
  const absoluteUrl = (path: string) => new URL(path, baseUrl).toString();
  const { projects, legislators, glossary } = await fetchPublicBootstrap({ fresh: true, throwOnError: true });

  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/glosario'), changeFrequency: 'weekly', priority: 0.8 },
    ...projects.map((project) => ({
      url: absoluteUrl(`/proyectos/${project.slug}`),
      lastModified: project.updatedAt ? new Date(project.updatedAt) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...legislators.map((legislator) => ({
      url: absoluteUrl(`/legisladores/${legislator.slug}`),
      lastModified: legislator.updatedAt ? new Date(legislator.updatedAt) : undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...glossary.map((term) => ({
      url: absoluteUrl(`/glosario/${term.slug}`),
      lastModified: term.updatedAt ? new Date(term.updatedAt) : undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
