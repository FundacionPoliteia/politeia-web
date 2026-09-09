import type { ProjectPosition } from '@politeia/quorum-contracts';
import { formatDate } from '@/lib/api';
import styles from './ProjectPositions.module.css';

export default function ProjectPositions({ items }: { items: ProjectPosition[] }) {
  if (!items.length) return null;
  return <section className="content-block">
    <span className="eyebrow">Voces del debate</span>
    <h2>A favor / En contra</h2>
    <div className={styles.columns}>
      {(['for', 'against'] as const).map((stance) => {
        const positions = items.filter((item) => item.stance === stance);
        return <section className={`${styles.column} ${stance === 'for' ? styles.support : styles.opposition}`} key={stance}>
          <header className={styles.heading}><h3>{stance === 'for' ? 'A favor' : 'En contra'}</h3><span aria-label={`${positions.length} declaraciones`}>{positions.length}</span></header>
          {!positions.length && <p className={styles.empty}>Todavía no hay declaraciones registradas.</p>}
          {positions.map((item) => <article className={styles.statement} key={item.id}>
            <header className={styles.person}><span className={styles.avatar} aria-hidden="true">{item.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('')}</span><div><strong>{item.name}</strong>{item.role && <span>{item.role}</span>}{item.date && <time dateTime={item.date}>{formatDate(item.date)}</time>}</div></header>
            {item.quote.length > 240 ? <details className={styles.quoteDetails}><summary><span className={styles.excerpt}>{item.quote.slice(0, 240).replace(/\s+\S*$/, '')}…</span><span className={styles.expand}>Leer declaración completa</span><span className={styles.collapse}>Cerrar declaración</span></summary><blockquote>{item.quote}</blockquote></details> : <blockquote>{item.quote}</blockquote>}
            {item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl) && <a className={styles.source} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceLabel || 'Ver fuente'}<span className="material-symbols-outlined" aria-hidden="true">open_in_new</span></a>}
            {!item.sourceUrl && <span className={styles.sourceNote}>{item.sourceLabel || 'Fuente no consignada'}</span>}
          </article>)}
        </section>;
      })}
    </div>
  </section>;
}
