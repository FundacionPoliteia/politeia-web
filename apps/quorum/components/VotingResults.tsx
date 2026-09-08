import { voteChoices, voteLabels, type VotingResult, type VoteCounts } from '@politeia/quorum-contracts';

export function VoteChart({ counts }: { counts: VoteCounts }) {
  const total = voteChoices.reduce((sum, key) => sum + counts[key], 0);
  return <div className="vote-chart" aria-label="Distribución de votos y ausencias">
    {voteChoices.map(key => <div className={`vote-chart-row vote-${key}`} key={key}><span>{voteLabels[key]}</span><span className="vote-track" aria-hidden="true"><span style={{ width: `${total ? counts[key] / total * 100 : 0}%` }} /></span><strong>{counts[key]}</strong></div>)}
    <p>{total} registros. Las ausencias y «No votó» no son votos negativos.</p>
  </div>;
}

export default function VotingResults({ items }: { items: VotingResult[] }) {
  if (!items.length) return null;
  return <section className="content-block voting-results"><span className="eyebrow">Resultado de votaciones</span><h2>Cómo votó cada cámara</h2>
    {(['deputies', 'senate'] as const).map(chamber => {
      const votes = items.filter(v => v.chamber === chamber).sort((a, b) => b.date.localeCompare(a.date));
      if (!votes.length) return null;
      return <section key={chamber}><h3>{chamber === 'deputies' ? 'Diputados' : 'Senado'}</h3>{votes.map(vote => <article className="vote-result" key={vote.id}>
        <time dateTime={vote.date}>{new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(new Date(`${vote.date}T12:00:00Z`))}</time>
        <h4>{vote.subject}</h4><p>{({ general: 'En general', particular: 'En particular', motion: 'Moción', unspecified: 'Objeto sin clasificar' })[vote.type]} · {({ nominal: 'Nominal', aggregate: 'Totales', showOfHands: 'Por signos' })[vote.method]} · {({ approved: 'Aprobada', rejected: 'Rechazada', pending: 'Resultado sin confirmar' })[vote.outcome]}</p>
        {vote.majorityRule && <p>Regla informada: {vote.majorityRule}</p>}
        {vote.official && <p className="muted">{vote.official.overriddenFields.length ? 'Basado en acta oficial, con edición de Quórum.' : 'Datos importados del acta oficial.'}</p>}
        {vote.counts ? <VoteChart counts={vote.counts} /> : <p>No hay recuento numérico disponible.</p>}
        {vote.blocks.length > 0 && <details><summary>Detalle por bloque ({vote.blocks.length})</summary><p>Detalle disponible; puede ser parcial. No se suma nuevamente a los totales.</p>{vote.blocks.map(block => <section key={block.name}><h4>{block.name}</h4><VoteChart counts={block.counts} /></section>)}</details>}
        {vote.nominal.length > 0 && <details><summary>Detalle nominal ({vote.nominal.length})</summary><p>Se muestran las personas con voto registrado; las faltantes no se consideran ausentes.</p><ul>{vote.nominal.map(person => <li key={person.legislatorId}><strong>{person.name}</strong> · {person.bloc || 'Bloque no informado'} · {voteLabels[person.choice]}</li>)}</ul></details>}
        {vote.notes && <p>{vote.notes}</p>}{vote.sourceUrl && <a href={vote.sourceUrl} target="_blank" rel="noopener noreferrer">Consultar fuente ↗</a>}
      </article>)}</section>;
    })}
  </section>;
}
