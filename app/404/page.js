export const metadata = {
  title: 'Pagina no encontrada - Politeia',
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
        <h1>Pagina no encontrada.</h1>
        <p className="lead">La pagina que estas buscando no existe o no esta disponible.</p>
      </div>
    </main>
  );
}
