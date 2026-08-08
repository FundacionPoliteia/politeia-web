import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchPublicBootstrap, fetchPublicLegislator, formatDate } from '@/lib/api';

export async function generateStaticParams() {
  const { legislators } = await fetchPublicBootstrap();
  return legislators.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = await fetchPublicLegislator((await params).slug);
  if (!item) return {};
  return { title: item.fullName, description: `${item.office} por ${item.district}. Perfil legislativo en Quórum.`, alternates: { canonical: `/legisladores/${item.slug}` }, openGraph: { title: `${item.fullName} · Quórum`, description: `${item.bloc || item.party} · ${item.district}`, type: 'profile' } };
}

export default async function LegislatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const item = await fetchPublicLegislator((await params).slug);
  if (!item) notFound();
  return <main id="contenido"><section className="detail-hero"><div className="shell"><div className="breadcrumbs"><Link href="/">Inicio</Link><span>/</span><span>Legisladores</span><span>/</span><span>{item.fullName}</span></div><span className="eyebrow">Perfil legislativo</span><h1>{item.fullName}</h1><div className="fact-grid"><div className="fact"><span>Cargo</span><strong>{item.office}</strong></div><div className="fact"><span>Distrito</span><strong>{item.district || 'Sin informar'}</strong></div><div className="fact"><span>Bloque</span><strong>{item.bloc || 'Sin informar'}</strong></div><div className="fact"><span>Mandato</span><strong>{item.mandateStart ? `${formatDate(item.mandateStart)} — ${formatDate(item.mandateEnd)}` : 'Sin informar'}</strong></div></div></div></section><section className="section"><div className="shell detail-layout"><div><div className="content-block"><h2>Trayectoria</h2><p>{item.bio || 'El perfil biográfico todavía no fue completado.'}</p></div>{item.academicTitle && <div className="content-block"><h2>Formación</h2><p>{item.academicTitle}</p></div>}</div>{item.attendance && <aside className="sidebar-card"><span className="eyebrow">Asistencia</span><h2>{item.attendance.value}%</h2><p>Dato actualizado al {formatDate(item.attendance.asOf)}.</p><a className="button ghost" href={item.attendance.sourceUrl} target="_blank" rel="noreferrer">Consultar fuente</a></aside>}</div></section></main>;
}
