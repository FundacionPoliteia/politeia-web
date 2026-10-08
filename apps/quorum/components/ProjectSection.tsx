'use client';

import { Suspense, useState } from 'react';
import type { PublicBootstrap } from '@/lib/api';
import ProjectExplorer from './ProjectExplorer';

type ProjectView = 'list' | 'grid';

export default function ProjectSection({ data }: { data: PublicBootstrap }) {
  const [mobileView, setMobileView] = useState<ProjectView>('list');

  return (
    <div className="project-section-layout">
      <div className="section-heading project-section-heading">
        <div>
          <span className="eyebrow">Seguimiento legislativo</span>
          <h2>Todos los proyectos.</h2>
        </div>
        <p>Explorá tanto los proyectos destacados como el resto del seguimiento. Buscá por nombre o expediente y filtrá según la etapa, la cámara de origen o el tipo de iniciativa.</p>
      </div>
      {data.projects.length > 0 && <div className="project-view-toggle project-view-toggle--sticky" role="group" aria-label="Vista de proyectos">
        <button type="button" aria-label="Vista en grilla" aria-pressed={mobileView === 'grid'} onClick={() => setMobileView('grid')}><span className="material-symbols-outlined" aria-hidden="true">grid_view</span></button>
        <button type="button" aria-label="Vista en lista" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}><span className="material-symbols-outlined" aria-hidden="true">view_list</span></button>
      </div>}
      <div className="project-section-explorer">
        <Suspense fallback={<div className="empty-state">Cargando proyectos…</div>}>
          <ProjectExplorer data={data} mobileView={mobileView} onMobileViewChange={setMobileView} />
        </Suspense>
      </div>
    </div>
  );
}
