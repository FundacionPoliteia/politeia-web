export default function PublicContentUnavailable({
  title = 'No pudimos cargar esta información',
  message = 'El servicio está teniendo un problema temporal. Probá nuevamente en unos minutos.',
  retryHref = '/',
}: {
  title?: string;
  message?: string;
  retryHref?: string;
}) {
  return <main id="contenido">
    <section className="detail-hero">
      <div className="shell">
        <span className="eyebrow">Información temporalmente no disponible</span>
        <h1>{title}</h1>
        <p className="hero-copy">{message}</p>
        <a className="button primary" href={retryHref}>Reintentar</a>
      </div>
    </section>
  </main>;
}
