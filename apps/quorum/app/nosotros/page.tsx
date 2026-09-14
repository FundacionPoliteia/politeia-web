import type { Metadata } from 'next';
import type { PublicTeamMember } from '@politeia/quorum-contracts';
import TeamProfiles from '@/components/TeamProfiles';
import styles from '@/components/TeamProfiles.module.css';
import { fetchPublicTeam } from '@/lib/api';

export const metadata: Metadata = { title: 'Nosotros', description: 'Conocé a las personas que participan de Quórum y su función en el equipo.', alternates: { canonical: '/nosotros' } };
export const dynamic = 'force-dynamic';
export default async function AboutPage() {
  let members: PublicTeamMember[] = [];
  let unavailable = false;
  try { members = await fetchPublicTeam(); } catch { unavailable = true; }
  return <main id="contenido"><header className={styles.hero}><div className="shell"><span className="eyebrow">Nosotros · Quórum</span><h1>Las personas detrás de Quórum.</h1><p className={styles.intro}>Quórum es un proyecto de Fundación Politeia. Conocé a quienes participan y el lugar desde el que aportan al equipo.</p></div></header>
    <section className="section" aria-label="Integrantes de Quórum"><div className="shell">{members.length ? <TeamProfiles members={members} /> : <div className="empty-state"><strong>{unavailable ? 'No pudimos cargar el equipo' : 'Estamos preparando nuestra presentación'}</strong><p>{unavailable ? 'Intentá recargar la página en unos momentos.' : 'Los perfiles aparecerán aquí cuando el equipo los publique.'}</p></div>}</div></section>
  </main>;
}
