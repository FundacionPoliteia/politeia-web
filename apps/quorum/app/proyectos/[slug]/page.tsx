import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProjectDetail from '@/components/ProjectDetail';
import { fetchPublicBootstrap, fetchPublicProject } from '@/lib/api';
import { richTextExcerpt } from '@/lib/richText';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await fetchPublicProject(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return { title: project.title, description: richTextExcerpt(project.summary, project.summaryFormat, 155), alternates: { canonical: `/proyectos/${project.slug}` }, openGraph: { title: project.title, description: richTextExcerpt(project.summary, project.summaryFormat, 180), url: `/proyectos/${project.slug}`, type: 'article' } };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, bootstrap] = await Promise.all([fetchPublicProject(slug), fetchPublicBootstrap()]);
  if (!project) notFound();
  return <ProjectDetail project={project} subscriptionsEnabled={bootstrap.settings.subscriptionsEnabled} stageExplanations={bootstrap.settings.legislativeStageExplanations} />;
}
