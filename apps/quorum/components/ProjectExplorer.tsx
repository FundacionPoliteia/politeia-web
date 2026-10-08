'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { effectiveProjectStageId, isPublicDebateFilter, isPublicDebateProject, PUBLIC_DEBATE_FILTER_ID, type PublicProject } from '@politeia/quorum-contracts';
import { publicApiBase, type PublicBootstrap } from '@/lib/api';
import { richTextExcerpt, richTextPlainText } from '@/lib/richText';
import { latestProjectStageTransition, projectStageVisualState } from '@/lib/projectStages';
import { isProjectAwaitingFormalEntry } from '@/lib/projectIngress';
import { projectIcon, projectIconGlyph } from '@/lib/projectIcons';
import ProjectStageMovement from './ProjectStageMovement';

export default function ProjectExplorer({ data }: { data: PublicBootstrap }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'grid'>('list');
  const rawChamber = searchParams.get('camara') || '';
  const rawStage = searchParams.get('estado') || '';
  const legacyDebateFilter = isPublicDebateFilter(rawChamber) || isPublicDebateFilter(rawStage);
  const stage = isPublicDebateFilter(rawStage) ? '' : rawStage;
  const initiative = searchParams.get('iniciativa') || '';
  const publicDebate = searchParams.get('situacion') === PUBLIC_DEBATE_FILTER_ID || legacyDebateFilter;
  const chamber = isPublicDebateFilter(rawChamber) ? '' : rawChamber;
  const activeFilterCount = [query.trim(), stage, publicDebate, initiative, chamber].filter(Boolean).length;

  const filtered = useMemo(() => data.projects.filter((project) => {
    const haystack = `${project.title} ${project.docketNumber} ${richTextPlainText(project.summary, project.summaryFormat)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const cleanQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return (!cleanQuery || haystack.includes(cleanQuery))
      && (!stage || effectiveProjectStageId(project) === stage)
      && (!publicDebate || isPublicDebateProject(project))
      && (!initiative || project.initiativeTypeId === initiative)
      && (!chamber || project.originChamberId === chamber);
  }), [data.projects, query, stage, publicDebate, initiative, chamber]);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (legacyDebateFilter) {
      if (isPublicDebateFilter(rawChamber)) params.delete('camara');
      if (isPublicDebateFilter(rawStage)) params.delete('estado');
      if (name !== 'situacion') params.set('situacion', PUBLIC_DEBATE_FILTER_ID);
    }
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

  const stages = data.workflows.flatMap((workflow) => workflow.stages).filter((item, index, all) => item.active && !isPublicDebateFilter(item.id) && !isPublicDebateFilter(item.label) && !isPublicDebateFilter(item.shortLabel) && all.findIndex((candidate) => candidate.id === item.id) === index);
  const chambers = data.catalogs.filter((item) => item.kind === 'chamber' && !isPublicDebateFilter(item.id) && !isPublicDebateFilter(item.label));
  const initiatives = data.catalogs.filter((item) => item.kind === 'initiative');

  return (
    <div className="explorer">
      <div className={`project-filter-panel${filtersOpen ? ' open' : ''}`}>
        <button className="project-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="project-filters" onClick={() => setFiltersOpen((current) => !current)}>
          <span><strong>Filtros</strong><small>{activeFilterCount ? `${activeFilterCount} ${activeFilterCount === 1 ? 'activo' : 'activos'}` : 'Buscar y refinar proyectos'}</small></span>
          <span className="project-filter-chevron material-symbols-outlined" aria-hidden="true">expand_more</span>
        </button>
        <div className="filters" id="project-filters" aria-label="Filtros de proyectos">
        <label className="control"><span>Buscar</span><input type="search" value={query} placeholder="Nombre, expediente o tema" onChange={(event) => submitQuery(event.target.value)} /></label>
        <label className="control"><span>Estado</span><select value={stage} onChange={(event) => setParam('estado', event.target.value)}><option value="">Todos</option>{stages.map((item) => <option value={item.id} key={item.id}>{item.shortLabel}</option>)}</select></label>
        <label className="control"><span>Situación pública</span><select value={publicDebate ? PUBLIC_DEBATE_FILTER_ID : ''} onChange={(event) => setParam('situacion', event.target.value)}><option value="">Todas</option><option value={PUBLIC_DEBATE_FILTER_ID}>En debate público</option></select></label>
        <label className="control"><span>Iniciativa</span><select value={initiative} onChange={(event) => setParam('iniciativa', event.target.value)}><option value="">Todas</option>{initiatives.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <label className="control"><span>Cámara</span><select value={chamber} onChange={(event) => setParam('camara', event.target.value)}><option value="">Todas</option>{chambers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        </div>
      </div>
      {activeFilterCount > 0 && <div className="results-head" aria-live="polite"><span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'proyecto' : 'proyectos'}</span><button className="button ghost" type="button" onClick={() => { setQuery(''); router.replace('/#proyectos'); }}>Limpiar filtros</button></div>}
      {filtered.length > 0 && <div className="project-view-toggle" role="group" aria-label="Vista de proyectos">
        <button type="button" aria-label="Vista en grilla" aria-pressed={mobileView === 'grid'} onClick={() => setMobileView('grid')}><span className="material-symbols-outlined" aria-hidden="true">grid_view</span></button>
        <button type="button" aria-label="Vista en lista" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}><span className="material-symbols-outlined" aria-hidden="true">view_list</span></button>
      </div>}
      {filtered.length ? <div className={`project-grid${mobileView === 'grid' ? ' project-grid--compact' : ''}`} data-mobile-view={mobileView}>{filtered.map((project) => <ProjectCard project={project} key={project.id} />)}</div> : <div className="empty-state"><strong>{data.projects.length ? 'No hay resultados para esos filtros.' : 'El contenido público está en preparación.'}</strong><span>{data.projects.length ? 'Probá con otra búsqueda o limpiá la selección.' : 'Los borradores permanecen privados hasta que el equipo editorial valide y publique cada ficha.'}</span></div>}
    </div>
  );
}

function ProjectCard({ project }: { project: PublicProject }) {
  const currentStageId = effectiveProjectStageId(project);
  const current = project.workflow.stages.find((stage) => stage.id === currentStageId);
  const stageVisual = projectStageVisualState(project);
  const awaitingFormalEntry = isProjectAwaitingFormalEntry(project);
  const normalizedStageName = `${currentStageId} ${current?.label || ''} ${current?.shortLabel || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isPublicDebate = isPublicDebateProject(project) || (normalizedStageName.includes('debate') && normalizedStageName.includes('publico'));
  const transition = latestProjectStageTransition(project);
  const previousStage = project.workflow.stages.find((stage) => stage.id === transition?.previousStageId);
  const hasDirectionalTransition = (stageVisual === 'backward' || stageVisual === 'forward')
    && Boolean(previousStage && current && previousStage.id !== current.id);
  return (
    <Link className={`project-card stage-visual-${stageVisual}`} href={`/proyectos/${project.slug}`} onClick={() => metric('project-opened')}>
      <div className="card-top"><span className="project-card-identity"><span className="project-card-icon material-symbols-outlined" aria-hidden="true">{projectIconGlyph(projectIcon(project))}</span><span className="status-pill">{awaitingFormalEntry ? 'Sin ingreso formal' : current?.shortLabel || 'En seguimiento'}</span>{isPublicDebate && !normalizedStageName.includes('debate') && <span className="status-pill">Debate público</span>}</span><span className="docket">{awaitingFormalEntry ? 'Presentación pendiente' : project.docketNumber}</span></div>
      <h3>{project.title}</h3><p>{richTextExcerpt(project.summary, project.summaryFormat, 220)}</p>
      <div className="project-card-footer">
        {stageVisual === 'preparation'
          ? <div className="preparation-card-note"><span aria-hidden="true">✎</span><span>Borrador en circulación<small>Aún sin presentación formal</small></span></div>
          : stageVisual === 'unfiled'
            ? <div className="unfiled-card-note"><span aria-hidden="true">!</span><span>Presentación formal pendiente</span></div>
          : hasDirectionalTransition && previousStage && current
            ? <ProjectStageMovement direction={stageVisual === 'backward' ? 'backward' : 'forward'} previousStage={previousStage} currentStage={current} />
            : null}
        <span className="card-link">Ver ficha <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

function metric(event: string) {
  void fetch(`${publicApiBase}/v1/public/metrics`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ event }) }).catch(() => undefined);
}
