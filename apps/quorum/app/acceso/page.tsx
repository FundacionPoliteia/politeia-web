import type { Metadata } from 'next';
import PublicAccessLogin from '@/components/PublicAccessLogin';

export const metadata: Metadata = {
  title: 'Acceso a la prueba privada',
  robots: { index: false, follow: false, nocache: true },
};

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = normalizeNext((await searchParams).next);
  return <main id="contenido"><PublicAccessLogin nextPath={next} /></main>;
}

function normalizeNext(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
