import Link from 'next/link';

export default function Nav() {
  return (
    <nav className="nav">
      <div className="wrap nav-in">
        <Link href="/" className="logo">
          <span className="dot"></span>Politeia
        </Link>
        <div className="nav-links">
          <Link href="/origen">Origen</Link>
          <Link href="/proyectos">Proyectos</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/equipo">Equipo</Link>
          <Link href="/#news" className="nav-cta">Suscribirse</Link>
        </div>
      </div>
    </nav>
  );
}
