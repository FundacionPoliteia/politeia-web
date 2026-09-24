export default function PreparationState({ summary, detail }: { summary: string; detail: string }) {
  return <section className="preparation-state" aria-label="Proyecto en preparación, sin presentación formal">
    <svg className="preparation-illustration" viewBox="0 0 180 144" fill="none" aria-hidden="true">
      <path d="M42 25h77v100H42z" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" transform="rotate(-9 80 75)" />
      <path d="M57 17h61l22 23v88H57z" fill="var(--blanco)" stroke="currentColor" strokeWidth="2" />
      <path d="M118 17v24h22M73 58h49M73 73h42M73 88h30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m106 108 33-33 9 9-33 33-12 3z" fill="#eedcaa" stroke="currentColor" strokeWidth="2" />
      <circle cx="35" cy="48" r="4" fill="currentColor" /><circle cx="156" cy="115" r="3" fill="currentColor" />
    </svg>
    <div><span className="preparation-kicker">Antes del Congreso</span><h3>Borrador en circulación</h3><p>{summary}</p><p>{detail}</p>
      <div className="preparation-route"><strong>En preparación</strong><span aria-hidden="true">·····→</span><span>Presentación formal pendiente</span></div>
    </div>
  </section>;
}
