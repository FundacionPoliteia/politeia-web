export const metadata = {
  title: 'Politeia - Coming soon',
  description: 'Politeia esta preparando una nueva experiencia publica.',
};

export default function Home() {
  return (
    <main className="coming-page">
      <section className="coming-hero" aria-labelledby="coming-title">
        <div className="wrap coming-wrap">
          <div className="coming-copy">
            <span className="eyebrow">Politeia</span>
            <h1 id="coming-title">Estamos preparando una nueva experiencia.</h1>
            <p>
              Pronto tendremos novedades.
            </p>
          </div>
          <div className="coming-panel" aria-label="Progreso">
            <span className="coming-panel-kicker">Coming soon</span>
            <strong>politeia.ar</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
