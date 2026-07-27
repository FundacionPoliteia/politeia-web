'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function normalizePath(path = '/') {
  const cleanPath = path.split(/[?#]/)[0] || '/';

  if (cleanPath === '/') return '/';

  return cleanPath.replace(/\/+$/, '');
}

function pathIsActive(pathname, href, exact = false) {
  const currentPath = normalizePath(pathname);
  const targetPath = normalizePath(href);

  if (exact) return currentPath === targetPath;

  return (
    currentPath === targetPath ||
    currentPath.startsWith(`${targetPath}/`)
  );
}

function ActiveLink({ href, children, exact = false }) {
  const pathname = usePathname();
  const active = pathIsActive(pathname, href, exact);

  return (
    <span
      className={`nav-link-shell${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <Link href={href} aria-current={active ? 'page' : undefined}>
        {children}
      </Link>
    </span>
  );
}

export default function NavLinks({ blogLink }) {
  const pathname = usePathname();
  const blogIsActive = pathIsActive(pathname, '/blog');

  return (
    <>
      <div className="nav-links">
        <ActiveLink href="/origen">Origen</ActiveLink>
        <ActiveLink href="/proyectos">Proyectos</ActiveLink>

        <span
          className={`nav-link-shell${blogIsActive ? ' is-active' : ''}`}
          aria-current={blogIsActive ? 'page' : undefined}
        >
          {blogLink}
        </span>

        <ActiveLink href="/equipo">Equipo</ActiveLink>

        <Link href="/#news" className="nav-cta">
          Suscribirse
        </Link>
      </div>

      <style jsx global>{`
        .nav-link-shell {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .nav-link-shell a {
          transition: color 0.2s ease, font-weight 0.2s ease;
        }

        .nav-link-shell.is-active a {
          color: var(--tinta);
          font-weight: 700;
        }

        .nav-link-shell.is-active::after {
          content: '';
          position: absolute;
          right: 0;
          bottom: -8px;
          left: 0;
          height: 2px;
          border-radius: 999px;
          background: var(--azul);
        }

        @media (max-width: 860px) {
          .nav-link-shell {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
