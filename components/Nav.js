import Link from 'next/link';
import { getPosts } from '../lib/blogApi';
import BlogNavLink from './BlogNavLink';
import NavLinks from './NavLinks';

const LOGO = 'Politeia';
const SHOW_PUBLIC_NAV_LINKS = process.env.NEXT_PUBLIC_SITE_LAUNCHED === 'true';

export default async function Nav() {
  const posts = SHOW_PUBLIC_NAV_LINKS ? await getPosts(1) : [];
  const latestPostAt = posts[0]?.fecha || '';

  return (
    <nav className="nav" aria-label="Navegación principal">
      <div className="wrap nav-in">
        <Link href="/" className="logo" aria-label="Politeia — Inicio">
          <span className="dot"></span>
          <span className="logo-word" aria-hidden="true">
            {LOGO.split('').map((letter, index) => (
              <span className="logo-letter" key={`${letter}-${index}`}>
                {letter}
              </span>
            ))}
          </span>
        </Link>

        {SHOW_PUBLIC_NAV_LINKS && (
          <NavLinks
            blogLink={<BlogNavLink latestPostAt={latestPostAt} />}
          />
        )}
      </div>
    </nav>
  );
}
