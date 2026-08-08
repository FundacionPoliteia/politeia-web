import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchPublicBootstrap } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Glosario legislativo',
  description: 'Conceptos legislativos explicados en lenguaje claro.',
  alternates: { canonical: '/glosario' },
};

export default async function GlossaryPage() {
  const { glossary } = await fetchPublicBootstrap();
  return <main id="contenido">
    <section className="detail-hero"><div className="shell"><span className="eyebrow">Lenguaje claro</span><h1>Glosario legislativo</h1><p className="hero-copy">Definiciones propias para entender el recorrido de una ley, acompañadas por referencias oficiales cuando corresponde.</p></div></section>
    <section className="section"><div className="shell">
      {glossary.length ? <div className="profile-list">{glossary.map((term) => <article className="term-card" key={term.id}><span>Concepto</span><h2><Link href={`/glosario/${term.slug}`}>{term.term}</Link></h2><p>{term.shortDefinition || 'Abrí la ficha para consultar la definición completa.'}</p><Link className="card-link" href={`/glosario/${term.slug}`}>Ver definición completa <span aria-hidden="true">→</span></Link></article>)}</div> : <div className="empty-state"><strong>El glosario está en preparación</strong><p>El equipo editorial publicará los primeros términos luego de validarlos.</p></div>}
    </div></section>
  </main>;
}
