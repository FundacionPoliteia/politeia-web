import SubscriptionManager from '@/components/SubscriptionManager';
import { fetchPublicBootstrap } from '@/lib/api';

export const metadata = { title: 'Confirmar seguimiento', robots: { index: false, follow: false } };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [{ token = '' }, { projects }] = await Promise.all([searchParams, fetchPublicBootstrap()]);
  return <main id="contenido"><section className="shell article-page"><span className="eyebrow">Seguimiento por correo</span><h1>Confirmá tu suscripción</h1><SubscriptionManager mode="confirm" token={token} projects={projects} /></section></main>;
}
