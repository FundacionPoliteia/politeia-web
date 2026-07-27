'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BlogNavLink from './BlogNavLink';

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

function MobileLink({ href, icon, label }) {
  const pathname = usePathname();
  const active = href.startsWith('/#')
    ? false
    : pathIsActive(pathname, href);

  return (
    <Link
      href={href}
      className={`mobile-public-tab${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export default function NavLinks({ latestPostAt = '', mobile = false }) {
  const pathname = usePathname();
  const blogIsActive = pathIsActive(pathname, '/blog');

  if (mobile) {
    return (
      <div className="mobile-public-tabs" aria-label="Navegación principal">
        <MobileLink href="/origen" icon="history_edu" label="Origen" />
        <MobileLink href="/proyectos" icon="workspaces" label="Proyectos" />
        <BlogNavLink compact latestPostAt={latestPostAt} />
        <MobileLink href="/equipo" icon="groups" label="Equipo" />
        <MobileLink href="/agradecimientos" icon="favorite" label="Agradecimientos" />
      </div>
    );
  }

  return (
    <>
      <div className="nav-links">
        <ActiveLink href="/origen">Origen</ActiveLink>
        <ActiveLink href="/proyectos">Proyectos</ActiveLink>

        <span
          className={`nav-link-shell${blogIsActive ? ' is-active' : ''}`}
          aria-current={blogIsActive ? 'page' : undefined}
        >
          <BlogNavLink latestPostAt={latestPostAt} />
        </span>

        <ActiveLink href="/equipo">Equipo</ActiveLink>
        <ActiveLink href="/agradecimientos">Agradecimientos</ActiveLink>

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
      `}</style>
    </>
  );
}
