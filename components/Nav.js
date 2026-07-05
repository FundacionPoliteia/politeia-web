import Link from 'next/link';
import { getPosts } from '../lib/blogApi';
import BlogNavLink from './BlogNavLink';

const LOGO = 'Politeia';

export default async function Nav() {
  const posts = await getPosts(1);
  const latestPostAt = posts[0]?.fecha || '';

  return (
    <nav className="nav">
      <div className="wrap nav-in">
        <Link href="/" className="logo" aria-label="Politeia">
          <span className="dot"></span>
          <span className="logo-word" aria-hidden="true">
            {LOGO.split('').map((letter, index) => (
              <span className="logo-letter" key={`${letter}-${index}`}>
                {letter}
              </span>
            ))}
          </span>
        </Link>
        <div className="nav-links">
          <Link href="/origen">Origen</Link>
          <Link href="/proyectos">Proyectos</Link>
          <BlogNavLink latestPostAt={latestPostAt} />
          <Link href="/equipo">Equipo</Link>
          <Link href="/#news" className="nav-cta">Suscribirse</Link>
        </div>
      </div>
    </nav>
  );
}
