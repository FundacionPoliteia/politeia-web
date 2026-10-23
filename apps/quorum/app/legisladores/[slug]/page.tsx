import type { Metadata } from 'next';
import Link from 'next/link';
import PersonPhoto from '@/components/PersonPhoto';
import type { Legislator } from '@politeia/quorum-contracts';
import { notFound } from 'next/navigation';
import { fetchPublicLegislator, formatDate } from '@/lib/api';

// Profiles are editorial data from Cloud Run, not build-time Next content.
// Resolve every slug at request time so newly published profiles don't 404
// until the next Vercel build.
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = await fetchPublicLegislator((await params).slug);
  if (!item) return {};
  const role = officeLabel(item);
  return { title: item.fullName, description: `${role} por ${item.district || 'Argentina'}. Perfil público en Quórum.`, alternates: { canonical: `/legisladores/${item.slug}` }, openGraph: { title: `${item.fullName} · Quórum`, description: `${item.bloc || item.party} · ${item.district}`, type: 'profile' } };
}

export default async function LegislatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const item = await fetchPublicLegislator((await params).slug);
  if (!item) notFound();
  return <main id="contenido"><section className="detail-hero legislator-profile-hero"><div className="shell"><div className="breadcrumbs"><Link href="/">Inicio</Link><span>/</span><span>Legisladores</span><span>/</span><span>{item.fullName}</span></div><div className="legislator-profile-heading"><PersonPhoto url={item.photoUrl} name={item.fullName} large portrait /><div className="legislator-profile-title"><span className="eyebrow">{item.office === 'otro' ? 'Perfil público' : 'Perfil legislativo'}</span><h1>{item.fullName}</h1></div></div><div className="fact-grid legislator-profile-facts"><div className="fact"><span>Cargo</span><strong>{officeLabel(item)}</strong></div><div className="fact"><span>Distrito</span><strong>{item.district || 'Sin informar'}</strong></div><div className="fact"><span>Bloque</span><strong>{item.bloc || 'Sin informar'}</strong></div><div className="fact"><span>Mandato</span><strong>{item.mandateStart ? `${formatDate(item.mandateStart)} — ${formatDate(item.mandateEnd)}` : 'Sin informar'}</strong></div></div></div></section><section className="section"><div className="shell legislator-profile-content"><div><div className="content-block"><h2>Trayectoria</h2><p>{item.bio || 'El perfil biográfico todavía no fue completado.'}</p></div>{item.academicTitle && item.office !== 'otro' && <div className="content-block"><h2>Formación</h2><p>{item.academicTitle}</p></div>}</div>{item.attendance && <aside className="sidebar-card"><span className="eyebrow">Asistencia</span><h2>{item.attendance.value}%</h2><p>Dato actualizado al {formatDate(item.attendance.asOf)}.</p><a className="button ghost" href={item.attendance.sourceUrl} target="_blank" rel="noreferrer">Consultar fuente</a></aside>}</div></section></main>;
}

function officeLabel(item: Legislator) {
  if (item.office === 'otro') return item.academicTitle.trim() || 'Otro cargo';
  return item.office === 'diputado' ? 'Diputado/a' : 'Senador/a';
}
