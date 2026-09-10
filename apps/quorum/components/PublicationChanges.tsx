import { changeSections, projectChangeLabels, type ProjectChangeReport } from '@politeia/quorum-contracts';
import RichContent from './RichContent';
import styles from './PublicationChanges.module.css';

const kinds = { added: 'Agregado', removed: 'Quitado', modified: 'Modificado', reordered: 'Reordenado' };
const values: Record<string, string> = {
  for: 'A favor', against: 'En contra', deputies: 'Diputados', senate: 'Senado',
  approved: 'Aprobada', rejected: 'Rechazada', pending: 'Pendiente',
  plain: 'Texto simple', markdown: 'Texto enriquecido', all: 'Todas las instancias', first: 'Sólo la primera', custom: 'Control por instancia',
  yes: 'A favor', no: 'En contra', abstention: 'Abstención', absent: 'Ausente', notVoting: 'No votó',
  nominal: 'Nominal', aggregate: 'Totales', showOfHands: 'A mano alzada', general: 'En general', particular: 'En particular', motion: 'Moción', unspecified: 'Sin especificar',
};
function display(value: unknown, names: Record<string, string>): string {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return 'Sin contenido';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string') return names[value] || values[value] || value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => display(item, names)).join('\n');
  return Object.entries(value as Record<string, unknown>).filter(([key]) => key !== 'id').map(([key, item]) => (projectChangeLabels[key] || key) + ': ' + display(item, names)).join('\n');
}
export default function PublicationChanges({ report, names = {} }: { report: ProjectChangeReport; names?: Record<string, string> }) {
  return <section className={styles.report} aria-label="Cambios de esta publicación">
    <header><h3>{report.initial ? 'Primera publicación' : 'Cambios respecto de lo publicado'}</h3>
      <p>{report.fields.length ? `${report.sections.length} secciones · ${report.fields.length} cambios detectados` : 'Sin cambios de contenido respecto de la última revisión publicada.'}</p>
    </header>
    {report.significant && <p className={styles.notice}>Hay cambios de seguimiento: revisá especialmente los datos legislativos, las votaciones, las posturas o la cronología señalados.</p>}
    {report.sections.map((section) => {
      const fields = report.fields.filter((field) => field.section === section);
      return <details key={section} className={fields.some((field) => field.significant) ? styles.significant : ''}>
        <summary><span>{changeSections[section]}</span><small>{fields.length} {fields.length === 1 ? 'cambio' : 'cambios'}{fields.some((field) => field.significant) ? ' · Seguimiento' : ' · Edición'}</small></summary>
        {fields.map((field) => <article key={field.path}>
          <h4>{field.label} <small>{kinds[field.kind]}</small></h4>
          <div className={styles.comparison}>{(['before', 'after'] as const).map((side) => <div key={side}><strong>{side === 'before' ? 'Publicado' : 'Por publicar'}</strong>{field[side === 'before' ? 'beforeFormat' : 'afterFormat'] === 'markdown' && typeof field[side] === 'string' ? <div className={styles.rich}><RichContent value={field[side] as string} format="markdown" sectionId={side + field.path} /></div> : <pre>{display(field[side], names)}</pre>}</div>)}</div>
        </article>)}
      </details>;
    })}
    <p className={styles.help}>La clasificación se basa en los campos modificados. Un cambio de texto puede ser importante: revisá ambas versiones antes de confirmar. Las notificaciones siguen dependiendo de la cronología.</p>
  </section>;
}
