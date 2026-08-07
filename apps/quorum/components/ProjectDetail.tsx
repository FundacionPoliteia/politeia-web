import Link from 'next/link';
import { effectiveProjectStageId, glossaryTermAppearsInTexts, type PublicProject, type SiteSettings } from '@politeia/quorum-contracts';
import LegislatorDrawer from '@/components/LegislatorDrawer';
import ShareFollow from '@/components/ShareFollow';
import GlossaryAnnotatedText from '@/components/GlossaryAnnotatedText';
import RichContent from '@/components/RichContent';
import { formatDate } from '@/lib/api';
import { richTextExcerpt, richTextPlainText } from '@/lib/richText';
import { chronologyStageTransitions, chronologyStageVisuals, latestProjectStageTransition, projectStageVisualState } from '@/lib/projectStages';
import StageTracker from '@/components/StageTracker';

export default function ProjectDetail({ project, subscriptionsEnabled, stageExplanations = [], contentId = 'contenido' }: { project: PublicProject; subscriptionsEnabled: boolean; stageExplanations?: SiteSettings['legislativeStageExplanations']; contentId?: string }) {
  const currentStageId = effectiveProjectStageId(project);
  const current = project.workflow.stages.find((stage) => stage.id === currentStageId);
  const occurrenceMode = project.glossaryOccurrenceMode || 'all';
  const excludedOccurrenceIds = project.glossaryExcludedOccurrenceIds || [];
  const sortedUpdates = [...project.updates].sort((a, b) => b.date.localeCompare(a.date));
  const stageVisual = projectStageVisualState(project);
  const stageTransition = latestProjectStageTransition(project);
  const chronologyVisuals = chronologyStageVisuals(project);
  const chronologyTransitions = chronologyStageTransitions(project);
  const glossarySections = [
    { id: 'summary', text: richTextPlainText(project.summary, project.summaryFormat) },
    { id: 'impact', text: richTextPlainText(project.impact, project.impactFormat) },
    ...sortedUpdates.map((update) => ({ id: `update-${update.id}`, text: update.body })),
  ];
  const firstSectionByTerm = new Map<string, string>();
  if (occurrenceMode === 'first') for (const section of glossarySections) for (const term of project.glossary) {
    if (!firstSectionByTerm.has(term.id) && glossaryTermAppearsInTexts(term, [section.text])) firstSectionByTerm.set(term.id, section.id);
  }
  const termsFor = (sectionId: string) => occurrenceMode !== 'first' ? project.glossary : project.glossary.filter((term) => firstSectionByTerm.get(term.id) === sectionId);
  const authorAttribution = project.authorAttribution || project.author;
  const signatoryAttributions = project.signatoryAttributions?.length ? project.signatoryAttributions : project.signatories;
  const profiles = [project.author, ...project.signatories].filter((item): item is NonNullable<typeof item> => Boolean(item)).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  const hasAttributions = Boolean(authorAttribution || signatoryAttributions.length);

  return <main id={contentId}>
    <header className="detail-hero"><div className="shell">
      <nav className="breadcrumbs" aria-label="Migas de pan"><Link href="/">Inicio</Link><span>/</span><Link href="/#proyectos">Proyectos</Link><span>/</span><span aria-current="page">{project.title}</span></nav>
      <h1>{project.title}</h1>
      <div className="fact-grid project-facts">
        <div className="fact"><span>Expediente</span><strong>{project.docketNumber}</strong></div><div className="fact"><span>Cámara de origen</span><strong>{project.chamber?.label || 'Sin dato'}</strong></div><div className="fact"><span>Iniciativa</span><strong>{project.initiative?.label || 'Sin dato'}</strong></div><div className="fact"><span>Fecha de ingreso</span><strong>{formatDate(project.entryDate)}</strong></div><div className="fact"><span>Última actualización</span><strong>{formatDate(project.publishedAt)}</strong></div>
      </div>
    </div></header>
    <section className="section"><div className="shell detail-layout"><article>
      <section className="content-block"><span className="eyebrow">Estado del proyecto</span><h2>{current?.label}</h2><StageTracker workflow={project.workflow} currentStageId={currentStageId} previousStageId={stageVisual === 'backward' || stageVisual === 'forward' ? stageTransition?.previousStageId || null : null} chamber={project.chamber} initiative={project.initiative} visualState={stageVisual} explanations={stageExplanations} projectExplanations={project.stageExplanationOverrides} />{current?.description && <p>{current.description}</p>}</section>
      <section className="content-block"><span className="eyebrow">En pocas palabras</span><h2>Resumen del proyecto</h2><RichContent value={project.summary} format={project.summaryFormat} terms={termsFor('summary')} sectionId="summary" occurrenceMode={occurrenceMode} excludedOccurrenceIds={excludedOccurrenceIds} /></section>
      <section className="content-block"><span className="eyebrow">Impacto cotidiano</span><h2>¿Cómo me afecta?</h2><RichContent value={project.impact} format={project.impactFormat} terms={termsFor('impact')} sectionId="impact" occurrenceMode={occurrenceMode} excludedOccurrenceIds={excludedOccurrenceIds} /></section>
      {hasAttributions && <section className="content-block"><span className="eyebrow">Autoría y firmas</span><h2>Quiénes impulsan el proyecto</h2><p className="section-intro">La autoría identifica a quien presenta o impulsa la iniciativa. Los firmantes acompañan formalmente su presentación.</p><LegislatorDrawer author={authorAttribution} signatories={signatoryAttributions} profiles={profiles} /></section>}
      {sortedUpdates.length > 0 && <section className="content-block"><span className="eyebrow">Historial público</span><h2>Cronología de avances</h2><div className="timeline">{sortedUpdates.map((update) => {
        const sectionId = `update-${update.id}`;
        const visual = chronologyVisuals.get(update.id) || 'normal';
        const transition = chronologyTransitions.get(update.id);
        const previousStage = project.workflow.stages.find((stage) => stage.id === transition?.previousStageId);
        const updateStage = project.workflow.stages.find((stage) => stage.id === transition?.currentStageId);
        const showStageChange = update.showStageChange !== false && Boolean(update.stageId && transition?.previousStageId !== transition?.currentStageId);
        return <article className={`timeline-${showStageChange ? visual : 'normal'}`} key={update.id}>
          <time dateTime={update.date}>{formatDate(update.date)}</time>
          {showStageChange && <div className={`timeline-stage-change ${visual}`} aria-label={`Cambio de etapa: de ${previousStage?.label || 'etapa anterior'} a ${updateStage?.label || update.stageId}`}><span>{previousStage?.shortLabel || 'Etapa anterior'}</span><span className="timeline-stage-arrow" aria-hidden="true">{visual === 'backward' ? '↶' : '→'}</span><strong>{updateStage?.shortLabel || update.stageId}</strong></div>}
          <h3>{update.title}</h3><GlossaryAnnotatedText text={update.body} terms={termsFor(sectionId)} sectionId={sectionId} occurrenceMode={occurrenceMode} excludedOccurrenceIds={excludedOccurrenceIds} />
        </article>;
      })}</div></section>}
      {project.glossary.length > 0 && <section className="content-block"><span className="eyebrow">Palabras detectadas</span><h2>Glosario del proyecto</h2><div className="profile-list">{project.glossary.map((term) => <Link className="term-card project-term-card" href={`/glosario/${term.slug}`} aria-label={`Abrir la definición completa de ${term.term}`} key={term.id}><span>Definición</span><h3>{term.term}</h3><p>{richTextExcerpt(term.definition, term.definitionFormat, 150)}</p><span className="term-card-destination">Abrir definición <span aria-hidden="true">↗</span></span></Link>)}</div></section>}
      {(project.documents.length > 0 || project.sources.length > 0) && <section className="content-block"><span className="eyebrow">Trazabilidad</span><h2>Documentación y fuentes</h2><ul className="resource-list">{project.documents.map((document) => <li key={document.id}><a href={document.url} target="_blank" rel="noreferrer"><span>{document.title}</span><span aria-hidden="true">↗</span></a></li>)}{project.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer"><span>{source.label}</span><span aria-hidden="true">↗</span></a></li>)}</ul></section>}
    </article><aside><div className="sidebar-card"><h3>Guardá o compartí esta ficha</h3><p>El enlace siempre apunta a la última versión publicada por el equipo de Quórum.</p><ShareFollow projectId={project.id} title={project.title} subscriptionsEnabled={subscriptionsEnabled} /></div></aside></div></section>
  </main>;
}
