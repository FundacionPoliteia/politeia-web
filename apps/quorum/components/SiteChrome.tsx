import Link from 'next/link';

export function SiteHeader() {
  return <header className="site-header">
    <div className="shell header-inner">
      <Link className="wordmark" href="/" aria-label="Quórum Politeia, inicio"><strong className="wordmark-quorum" aria-hidden="true"><span className="wordmark-quorum-part wordmark-quorum-part-first">Quó</span><span className="wordmark-quorum-part wordmark-quorum-part-second">rum</span></strong><span>Politeia</span></Link>
      <nav aria-label="Navegación principal"><Link href="/#proyectos">Proyectos</Link><Link href="/glosario">Glosario</Link><Link href="/privacidad">Privacidad</Link></nav>
    </div>
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="shell">
    <div className="footer-grid">
      <div className="footer-brand"><Link className="footer-wordmark" href="/" aria-label="Quórum Politeia, inicio"><strong>Quórum</strong><span>Politeia</span></Link><p>Seguimiento legislativo en lenguaje claro para comprender qué se debate y cómo puede afectarte.</p></div>
      <nav className="footer-column" aria-label="Secciones de Quórum"><h2>Quórum</h2><Link href="/">Inicio</Link><Link href="/#proyectos">Proyectos</Link><Link href="/glosario">Glosario</Link><Link href="/privacidad">Privacidad</Link></nav>
      <nav className="footer-column" aria-label="Fundación Politeia"><h2>Fundación</h2><a href="https://politeia.ar/origen" target="_blank" rel="noopener noreferrer">Origen</a><a href="https://politeia.ar/equipo" target="_blank" rel="noopener noreferrer">Equipo</a><a href="https://politeia.ar/proyectos" target="_blank" rel="noopener noreferrer">Proyectos</a><a className="footer-join" href="https://politeia.ar/sumate" target="_blank" rel="noopener noreferrer"><span aria-hidden="true" className="footer-join-dot" />Sumate <span aria-hidden="true">→</span></a></nav>
      <nav className="footer-column" aria-label="Redes sociales de Fundación Politeia"><h2>Seguinos</h2><a href="https://www.instagram.com/fundacion.politeia/" target="_blank" rel="noopener noreferrer">Instagram</a><a href="https://twitter.com/politeiaarg" target="_blank" rel="noopener noreferrer">X / Twitter</a><a href="https://www.youtube.com/@politeia4626" target="_blank" rel="noopener noreferrer">YouTube</a></nav>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} Fundación Politeia. Hecho en Argentina.</span><a href="https://politeia.ar" target="_blank" rel="noopener noreferrer">politeia.ar</a></div>
  </div></footer>;
}
