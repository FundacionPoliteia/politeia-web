import SubscriptionManager from '@/components/SubscriptionManager';
import { fetchPublicBootstrap } from '@/lib/api';

export const metadata = { title: 'Preferencias de seguimiento', robots: { index: false, follow: false } };

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [{ token = '' }, { projects }] = await Promise.all([searchParams, fetchPublicBootstrap()]);
  return <main id="contenido"><section className="shell article-page"><span className="eyebrow">Seguimiento por correo</span><h1>Administrá tus avisos</h1><SubscriptionManager mode="preferences" token={token} projects={projects} /></section></main>;
}
