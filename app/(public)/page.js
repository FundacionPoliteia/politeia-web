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
              El sitio publico esta en etapa de puesta a punto. Mientras tanto,
              el equipo interno puede seguir probando el gestor de contenidos,
              roles, revision, comentarios y publicaciones desde el subdominio
              privado.
            </p>
            <div className="coming-status" aria-label="Estado del lanzamiento">
              <span>Contenido</span>
              <span>Revision</span>
              <span>Produccion</span>
            </div>
          </div>
          <div className="coming-panel" aria-label="Progreso">
            <span className="coming-panel-kicker">Coming soon</span>
            <strong>politeia.ar</strong>
            <p>
              Estamos ajustando los ultimos detalles antes de abrir la nueva
              version publica.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
