import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchGlossaryTerm, fetchPublicBootstrap } from '@/lib/api';
import MarkdownContent from '@/components/MarkdownContent';
import { richTextExcerpt } from '@/lib/richText';

export async function generateStaticParams() {
  const { glossary } = await fetchPublicBootstrap();
  return glossary.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const term = await fetchGlossaryTerm(slug);
  if (!term) return {};
  const description = term.shortDefinition || richTextExcerpt(term.definition, term.definitionFormat, 180);
  return { title: term.term, description: richTextExcerpt(description, 'plain', 155), alternates: { canonical: `/glosario/${term.slug}` }, openGraph: { title: `${term.term} · Glosario Quórum`, description: richTextExcerpt(description, 'plain', 180), type: 'article' } };
}

export default async function TermPage({ params }: { params: Promise<{ slug: string }> }) {
  const term = await fetchGlossaryTerm((await params).slug);
  if (!term) notFound();
  return <main id="contenido"><article className="shell article-page"><div className="breadcrumbs"><Link href="/">Inicio</Link><span>/</span><Link href="/glosario">Glosario</Link><span>/</span><span>{term.term}</span></div><span className="eyebrow">Glosario Quórum</span><h1>{term.term}</h1>{term.shortDefinition && <p className="article-lead">{term.shortDefinition}</p>}<MarkdownContent value={term.definition} format={term.definitionFormat} className="glossary-article-content" />{term.references.length > 0 && <><h2>Referencias complementarias</h2><ul className="resource-list">{term.references.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true">↗</span></a></li>)}</ul></>}</article></main>;
}
