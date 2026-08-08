import { Suspense } from 'react';
import KineticAdvanceWord from '@/components/KineticAdvanceWord';
import ProjectExplorer from '@/components/ProjectExplorer';
import { fetchPublicBootstrap } from '@/lib/api';

export default async function HomePage() {
  const data = await fetchPublicBootstrap();
  return (
    <main id="contenido">
      <section className="hero"><div className="shell hero-grid"><div><span className="eyebrow">Información legislativa</span><h1>Entendé qué se debate. Seguí cómo <KineticAdvanceWord /></h1><p className="hero-copy">Quórum es la plataforma de Politeia para conocer los principales proyectos tratados en el Congreso, comprender cómo pueden afectarte y consultar sus fuentes oficiales.</p></div><aside className="hero-note"><span>Nuestro compromiso</span><strong>Claridad antes que ruido.</strong><p>Información accesible, trazable y apartidaria, actualizada por un equipo editorial.</p></aside></div></section>
      <section className="section" id="proyectos"><div className="shell"><div className="section-heading"><div><span className="eyebrow">Seguimiento legislativo</span><h2>Explorá los proyectos.</h2></div><p>Buscá por nombre o expediente y filtrá según la etapa, la cámara de origen o el tipo de iniciativa.</p></div><Suspense fallback={<div className="empty-state">Cargando proyectos…</div>}><ProjectExplorer data={data} /></Suspense></div></section>
      {data.settings.electionPortal.enabled && data.settings.electionPortal.url && <section className="section"><div className="shell"><div className="election-block"><div><span className="eyebrow">Otra herramienta Politeia</span><h2>{data.settings.electionPortal.title}</h2><p>{data.settings.electionPortal.description}</p></div><a className="button primary" href={data.settings.electionPortal.url}>{data.settings.electionPortal.label} <span aria-hidden="true">↗</span></a></div></div></section>}
    </main>
  );
}
