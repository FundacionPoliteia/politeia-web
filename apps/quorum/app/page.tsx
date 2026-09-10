import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { effectiveProjectStageId, stageProgress, type PublicProject } from '@politeia/quorum-contracts';
import KineticAdvanceWord from '@/components/KineticAdvanceWord';
import ProjectExplorer from '@/components/ProjectExplorer';
import { fetchPublicBootstrap } from '@/lib/api';
import { projectIcon, projectIconGlyph } from '@/lib/projectIcons';
import { projectStageVisualState } from '@/lib/projectStages';

export default async function HomePage() {
  const data = await fetchPublicBootstrap();
  const featuredProjects = data.projects.filter((project) => project.featured).slice(0, 6);
  return (
    <main id="contenido">
      <section className="hero">
        <Image className="hero-congress" src="/images/congreso-silhouette.webp" alt="" aria-hidden="true" width={1536} height={1024} sizes="(max-width: 1536px) 100vw, 1536px" priority />
        <div className="shell hero-grid"><div><span className="eyebrow">Información legislativa</span><h1>Entendé qué se debate. Seguí cómo <KineticAdvanceWord /></h1><p className="hero-copy">Quórum es la plataforma de Fundación <a href="https://politeia.ar">Politeia</a> para conocer los principales proyectos tratados en el Congreso. Vas a encontrar resúmenes, comprender cómo pueden afectarte y consultar sus fuentes oficiales.</p></div><FeaturedProjects projects={featuredProjects} /></div>
      </section>
      <section className="section" id="proyectos"><div className="shell"><div className="section-heading"><div><span className="eyebrow">Seguimiento legislativo</span><h2>Todos los proyectos.</h2></div><p>Explorá tanto los proyectos destacados como el resto del seguimiento. Buscá por nombre o expediente y filtrá según la etapa, la cámara de origen o el tipo de iniciativa.</p></div><Suspense fallback={<div className="empty-state">Cargando proyectos…</div>}><ProjectExplorer data={data} /></Suspense></div></section>
      {data.settings.electionPortal.enabled && data.settings.electionPortal.url && <section className="section"><div className="shell"><div className="election-block"><div><span className="eyebrow">Otra herramienta Politeia</span><h2>{data.settings.electionPortal.title}</h2><p>{data.settings.electionPortal.description}</p></div><a className="button primary" href={data.settings.electionPortal.url}>{data.settings.electionPortal.label} <span aria-hidden="true">↗</span></a></div></div></section>}
    </main>
  );
}

function FeaturedProjects({ projects }: { projects: PublicProject[] }) {
  if (!projects.length) return <aside className="featured-projects-empty"><span className="eyebrow">Proyectos destacados</span><strong>El seguimiento principal está en preparación.</strong><p>Cuando el equipo publique una selección, vas a encontrarla acá.</p></aside>;
  return <aside className="featured-projects" aria-labelledby="featured-projects-title">
    <div className="featured-projects-heading"><span className="eyebrow" id="featured-projects-title">Proyectos destacados</span></div>
    <nav aria-label="Proyectos destacados">
      {projects.map((project, index) => {
        const stageId = effectiveProjectStageId(project);
        const stage = project.workflow.stages.find((item) => item.id === stageId);
        const stageVisual = projectStageVisualState(project);
        const progress = stageProgress(project.workflow, stageId);
        return <Link className={`featured-project-row stage-visual-${stageVisual}`} href={`/proyectos/${project.slug}`} key={project.id}>
          <span className="featured-project-icon material-symbols-outlined" aria-hidden="true">{projectIconGlyph(projectIcon(project, index))}</span>
          <span className="featured-project-copy">
            <strong>{project.title}</strong>
            <small className="featured-project-meta">
              {project.docketNumber && <span className="featured-project-docket">Exp. {project.docketNumber}</span>}
              <span>{[project.chamber?.label, project.initiative?.label].filter(Boolean).join(' · ') || 'Información legislativa'}</span>
            </small>
          </span>
          <span className="featured-project-arrow material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          <ol className="featured-project-progress" aria-label={`Recorrido legislativo. Estado actual: ${stage?.label || 'En seguimiento'}`}>
            {progress.map((step, stepIndex) => <li className={`featured-step ${step.state}`} key={step.id} aria-current={!stage?.branchFromId && step.state === 'current' ? 'step' : undefined} title={step.label}>
              <span className="featured-step-marker material-symbols-outlined" aria-hidden="true">{step.state === 'complete' ? 'check' : featuredStageIcon(step.id, stepIndex)}</span>
              <span className="featured-step-label">{step.shortLabel}</span>
            </li>)}
          </ol>
          {stage?.branchFromId && <span className="featured-project-outcome"><span className="material-symbols-outlined" aria-hidden="true">subdirectory_arrow_right</span>{stage.label}</span>}
        </Link>;
      })}
    </nav>
  </aside>;
}

function featuredStageIcon(id: string, index: number) {
  const icons: Record<string, string> = {
    'mesa-de-entrada': 'move_to_inbox', comisiones: 'groups', dictamen: 'description',
    'media-sancion': 'account_balance', 'sancion-definitiva': 'verified', promulgacion: 'gavel',
  };
  return icons[id] || (index === 0 ? 'move_to_inbox' : 'circle');
}
