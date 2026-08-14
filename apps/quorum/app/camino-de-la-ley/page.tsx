import type { Metadata } from 'next';
import LegislativePath from '@/components/LegislativePath';

export const metadata: Metadata = {
  title: 'El camino de la ley',
  description:
    'Detallamos cada una de las etapas que atraviesa un proyecto en el Congreso, desde su presentación inicial hasta su sanción definitiva, promulgación o rechazo.',
  alternates: {
    canonical: '/camino-de-la-ley',
  },
};

export default function CaminoDeLaLeyPage() {
  return <LegislativePath />;
}
