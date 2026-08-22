export const metadata = {
  title: 'Página no encontrada - Politeia',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFoundPage() {
  return (
    <main className="page-hero">
      <div className="wrap">
        <span className="eyebrow">404</span>
        <h1>Página no encontrada.</h1>
        <p className="lead">La página que estás buscando no existe o no está disponible.</p>
      </div>
    </main>
  );
}
