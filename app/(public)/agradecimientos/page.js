import LegacySections from '../../../components/LegacySections';

export const metadata = {
  title: 'A nuestros cimientos — Politeia',
  description:
    'Fundación Politeia agradece el legado, la compañía y la vocación de servicio de Fernando Antonio Oyuela.',
  openGraph: {
    title: 'A nuestros cimientos — Politeia',
    description:
      'Un agradecimiento al legado de transformación y vocación de servicio de Fernando Antonio Oyuela.',
    images: ['/fernando-antonio-oyuela.jpeg'],
  },
};

export default function AgradecimientosPage() {
  return (
    <main className="thanks-page">
      <LegacySections />
    </main>
  );
}
