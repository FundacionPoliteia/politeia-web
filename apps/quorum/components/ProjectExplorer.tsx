'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { effectiveProjectStageId, stageProgress, type PublicProject } from '@politeia/quorum-contracts';
import { publicApiBase, type PublicBootstrap } from '@/lib/api';
import { richTextExcerpt, richTextPlainText } from '@/lib/richText';
import { latestProjectStageTransition, projectStageVisualState } from '@/lib/projectStages';

export default function ProjectExplorer({ data }: { data: PublicBootstrap }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const stage = searchParams.get('estado') || '';
  const initiative = searchParams.get('iniciativa') || '';
  const chamber = searchParams.get('camara') || '';
  const activeFilterCount = [query.trim(), stage, initiative, chamber].filter(Boolean).length;

  const filtered = useMemo(() => data.projects.filter((project) => {
    const haystack = `${project.title} ${project.docketNumber} ${richTextPlainText(project.summary, project.summaryFormat)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cleanQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return (!cleanQuery || haystack.includes(cleanQuery))
      && (!stage || effectiveProjectStageId(project) === stage)
      && (!initiative || project.initiativeTypeId === initiative)
      && (!chamber || project.originChamberId === chamber);
  }), [data.projects, query, stage, initiative, chamber]);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    value ? params.set(name, value) : params.delete(name);
    router.replace(`/?${params.toString()}#proyectos`, { scroll: false });
    metric(value ? 'filter-used' : 'filter-used');
  }

  function submitQuery(value: string) {
    setQuery(value);
    const params = new URLSearchParams(searchParams.toString());
    value ? params.set('q', value) : params.delete('q');
    router.replace(`/?${params.toString()}#proyectos`, { scroll: false });
    if (value.trim()) metric('search-used');
  }

  const stages = data.workflows.flatMap((workflow) => workflow.stages).filter((item, index, all) => item.active && all.findIndex((candidate) => candidate.id === item.id) === index);
  const chambers = data.catalogs.filter((item) => item.kind === 'chamber');
  const initiatives = data.catalogs.filter((item) => item.kind === 'initiative');

  return (
    <div className="explorer">
      <div className={`project-filter-panel${filtersOpen ? ' open' : ''}`}>
        <button className="project-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="project-filters" onClick={() => setFiltersOpen((current) => !current)}>
          <span><strong>Filtros</strong><small>{activeFilterCount ? `${activeFilterCount} ${activeFilterCount === 1 ? 'activo' : 'activos'}` : 'Buscar y refinar proyectos'}</small></span>
          <span className="project-filter-chevron" aria-hidden="true">⌄</span>
        </button>
        <div className="filters" id="project-filters" aria-label="Filtros de proyectos">
        <label className="control"><span>Buscar</span><input type="search" value={query} placeholder="Nombre, expediente o tema" onChange={(event) => submitQuery(event.target.value)} /></label>
        <label className="control"><span>Estado</span><select value={stage} onChange={(event) => setParam('estado', event.target.value)}><option value="">Todos</option>{stages.map((item) => <option value={item.id} key={item.id}>{item.shortLabel}</option>)}</select></label>
        <label className="control"><span>Iniciativa</span><select value={initiative} onChange={(event) => setParam('iniciativa', event.target.value)}><option value="">Todas</option>{initiatives.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <label className="control"><span>Cámara</span><select value={chamber} onChange={(event) => setParam('camara', event.target.value)}><option value="">Todas</option>{chambers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        </div>
      </div>
      {activeFilterCount > 0 && <div className="results-head" aria-live="polite"><span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'proyecto' : 'proyectos'}</span><button className="button ghost" type="button" onClick={() => { setQuery(''); router.replace('/#proyectos'); }}>Limpiar filtros</button></div>}
      {filtered.length ? <div className="project-grid">{filtered.map((project) => <ProjectCard project={project} key={project.id} />)}</div> : <div className="empty-state"><strong>{data.projects.length ? 'No hay resultados para esos filtros.' : 'El contenido público está en preparación.'}</strong><span>{data.projects.length ? 'Probá con otra búsqueda o limpiá la selección.' : 'Los borradores permanecen privados hasta que el equipo editorial valide y publique cada ficha.'}</span></div>}
    </div>
  );
}

function ProjectCard({ project }: { project: PublicProject }) {
  const currentStageId = effectiveProjectStageId(project);
  const progress = stageProgress(project.workflow, currentStageId);
  const current = project.workflow.stages.find((stage) => stage.id === currentStageId);
  const stageVisual = projectStageVisualState(project);
  const transition = latestProjectStageTransition(project);
  const hasDirectionalTransition = stageVisual === 'backward' || stageVisual === 'forward';
  const previousStageId = hasDirectionalTransition ? transition?.previousStageId || null : null;
  const currentIndex = progress.findIndex((stage) => stage.id === currentStageId);
  const previousIndex = progress.findIndex((stage) => stage.id === previousStageId);
  const showDirectionalPath = hasDirectionalTransition && currentIndex >= 0 && previousIndex >= 0;
  const transitionStart = Math.min(currentIndex, previousIndex);
  const transitionEnd = Math.max(currentIndex, previousIndex);
  const stageAria = hasDirectionalTransition && previousStageId
    ? `Etapa actual: ${current?.label || currentStageId}. El proyecto ${stageVisual === 'backward' ? 'retrocedió' : 'avanzó'} desde ${project.workflow.stages.find((stage) => stage.id === previousStageId)?.label || previousStageId}`
    : `Etapa actual: ${current?.label || currentStageId}`;
  return (
    <Link className={`project-card stage-visual-${stageVisual}`} href={`/proyectos/${project.slug}`} onClick={() => metric('project-opened')}>
      <div className="card-top"><span className="status-pill">{current?.shortLabel || 'En seguimiento'}</span><span className="docket">{project.docketNumber}</span></div>
      <h3>{project.title}</h3><p>{richTextExcerpt(project.summary, project.summaryFormat, 220)}</p>
      <div className="mini-progress" aria-label={stageAria}>{progress.map((stage, index) => <span className={`${stage.state}${showDirectionalPath && index >= transitionStart && index < transitionEnd ? ' transition-path' : ''}${showDirectionalPath && stage.id === previousStageId ? ' transitioned-from' : ''}`} key={stage.id} />)}</div>
      <span className="card-link">Ver ficha <span aria-hidden="true">→</span></span>
    </Link>
  );
}

function metric(event: string) {
  void fetch(`${publicApiBase}/v1/public/metrics`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ event }) }).catch(() => undefined);
}
