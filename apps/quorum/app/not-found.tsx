import Link from 'next/link';

export default function NotFound() {
  return <main id="contenido" className="shell empty-page"><span className="eyebrow">404</span><h1>No encontramos esa página.</h1><p>Puede que el contenido todavía sea un borrador o que haya cambiado.</p><Link className="button primary" href="/">Volver al inicio</Link></main>;
}
