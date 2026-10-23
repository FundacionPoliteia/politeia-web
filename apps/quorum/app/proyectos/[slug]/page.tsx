import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProjectDetail from '@/components/ProjectDetail';
import { fetchPublicBootstrap, fetchPublicProject } from '@/lib/api';
import { richTextExcerpt } from '@/lib/richText';
import PublicContentUnavailable from '@/components/PublicContentUnavailable';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let project;
  try { project = await fetchPublicProject(slug); } catch { return {}; }
  if (!project) return { title: 'Proyecto no encontrado' };
  return { title: project.title, description: richTextExcerpt(project.summary, project.summaryFormat, 155), alternates: { canonical: `/proyectos/${project.slug}` }, openGraph: { title: project.title, description: richTextExcerpt(project.summary, project.summaryFormat, 180), url: `/proyectos/${project.slug}`, type: 'article' } };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let project;
  try { project = await fetchPublicProject(slug); } catch {
    return <PublicContentUnavailable title="La ficha no está disponible por el momento" message="No pudimos conectar con el servicio de proyectos. Volvé a intentarlo en unos minutos." retryHref={`/proyectos/${encodeURIComponent(slug)}`} />;
  }
  if (!project) notFound();
  const bootstrap = await fetchPublicBootstrap();
  return <ProjectDetail project={project} subscriptionsEnabled={bootstrap.settings.subscriptionsEnabled} stageExplanations={bootstrap.settings.legislativeStageExplanations} legislators={bootstrap.legislators} />;
}
