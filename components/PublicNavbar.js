'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import BlogNavLink from './BlogNavLink';

function normalizePath(path = '/') {
  const cleanPath = path.split(/[?#]/)[0] || '/';
  if (cleanPath === '/') return '/';
  return cleanPath.replace(/\/+$/, '');
}

function pathIsActive(pathname, href) {
  const currentPath = normalizePath(pathname);
  const targetPath = normalizePath(href);
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function NavLink({ href, label, active }) {
  return <span className={`nav-link-shell${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
    <Link href={href} aria-current={active ? 'page' : undefined}>{label}</Link>
  </span>;
}

function MobileLink({ href, label, icon, active }) {
  return <Link href={href} className={`mobile-public-tab${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
    <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
    <span>{label}</span>
  </Link>;
}

function QuorumLogo() {
  return <Link className="logo logo--quorum" href="/" aria-label="Quórum Politeia, inicio">
    <span className="dot" aria-hidden="true" />
    <span className="logo-word logo-word--quorum" aria-hidden="true">Quórum</span>
    <span className="logo-suffix">Politeia</span>
  </Link>;
}

function PoliteiaLogo() {
  return <Link href="/" className="logo" aria-label="Politeia — Inicio">
    <span className="dot" />
    <span className="logo-word" aria-hidden="true">
      {'Politeia'.split('').map((letter, index) => <span className="logo-letter" key={`${letter}-${index}`}>{letter}</span>)}
    </span>
  </Link>;
}

export default function PublicNavbar({ latestPostAt = '', variant = 'politeia', showLinks = true, showOnManagement = false }) {
  const pathname = usePathname() || '/';
  const [projectsVisible, setProjectsVisible] = useState(false);
  const isQuorum = variant === 'quorum';
  const isManagementRoute = isQuorum && (pathname === '/gestion' || pathname.startsWith('/gestion/'));
  const isAccessRoute = isQuorum && pathname === '/acceso';

  useEffect(() => {
    setProjectsVisible(false);
    if (pathname !== '/') return;

    const projects = document.getElementById('proyectos');
    if (!projects) return;

    const updateVisibility = () => {
      const bounds = projects.getBoundingClientRect();
      setProjectsVisible(bounds.top < window.innerHeight * .75 && bounds.bottom > 72);
    };
    const observer = new IntersectionObserver(([entry]) => setProjectsVisible(entry.isIntersecting), {
      rootMargin: '-72px 0px -25% 0px',
    });

    updateVisibility();
    observer.observe(projects);
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateVisibility);
    };
  }, [pathname]);

  // The management app supplies its own navigation. Do not leave the fixed
  // public tabs mounted behind it on small screens.
  if (isManagementRoute && !showOnManagement) return null;

  const projectsActive = isQuorum
    ? pathname === '/proyectos' || pathname.startsWith('/proyectos/') || (pathname === '/' && projectsVisible)
    : pathIsActive(pathname, '/proyectos');
  const links = isQuorum
    ? [
        { href: '/#proyectos', label: 'Proyectos', active: projectsActive },
        { href: '/camino-de-la-ley', label: 'Camino de la ley', active: pathIsActive(pathname, '/camino-de-la-ley') },
        { href: '/glosario', label: 'Glosario', active: pathIsActive(pathname, '/glosario') },
        { href: '/nosotros', label: 'Nosotros', active: pathIsActive(pathname, '/nosotros') },
      ]
    : [
        { href: '/origen', label: 'Origen', active: pathIsActive(pathname, '/origen') },
        { href: '/proyectos', label: 'Proyectos', active: projectsActive },
        { href: '/equipo', label: 'Equipo', active: pathIsActive(pathname, '/equipo') },
        { href: '/agradecimientos', label: 'Agradecimientos', active: pathIsActive(pathname, '/agradecimientos') },
      ];
  const mobileLinks = isQuorum
    ? [
        { href: '/', label: 'Inicio', icon: 'home', active: pathname === '/' && !projectsVisible },
        { href: '/#proyectos', label: 'Proyectos', icon: 'account_balance', active: projectsActive },
        { href: '/camino-de-la-ley', label: 'Camino de la ley', icon: 'route', active: pathIsActive(pathname, '/camino-de-la-ley') },
        { href: '/glosario', label: 'Glosario', icon: 'menu_book', active: pathIsActive(pathname, '/glosario') },
        { href: '/nosotros', label: 'Nosotros', icon: 'groups', active: pathIsActive(pathname, '/nosotros') },
      ]
    : [
        { href: '/', label: 'Inicio', icon: 'home', active: pathname === '/' && !projectsVisible },
        { href: '/origen', label: 'Origen', icon: 'history_edu', active: pathIsActive(pathname, '/origen') },
        { href: '/proyectos', label: 'Proyectos', icon: 'workspaces', active: pathIsActive(pathname, '/proyectos') },
        { href: '/blog', label: 'Blog', icon: 'article', active: pathIsActive(pathname, '/blog') },
        { href: '/equipo', label: 'Equipo', icon: 'groups', active: pathIsActive(pathname, '/equipo') },
        { href: '/agradecimientos', label: 'Legado', icon: 'favorite', active: pathIsActive(pathname, '/agradecimientos') },
      ];

  return <>
    <nav className={`nav${isQuorum ? ' site-header' : ''}`} aria-label="Navegación principal">
      <div className="wrap nav-in">
        {isQuorum ? <QuorumLogo /> : <PoliteiaLogo />}
        {showLinks && <div className="nav-links">
          {links.slice(0, 2).map((link) => <NavLink key={link.href} {...link} />)}
          {!isQuorum && <span className={`nav-link-shell${pathIsActive(pathname, '/blog') ? ' is-active' : ''}`} aria-current={pathIsActive(pathname, '/blog') ? 'page' : undefined}><BlogNavLink latestPostAt={latestPostAt} /></span>}
          {links.slice(2).map((link) => <NavLink key={link.href} {...link} />)}
          {!isQuorum && <Link href="/#news" className="nav-cta">Suscribirse</Link>}
        </div>}
      </div>
    </nav>

    {showLinks && !isAccessRoute && <nav className={`mobile-public-tabs${isQuorum ? ' mobile-public-tabs--quorum' : ''}`} aria-label={`Navegación móvil de ${isQuorum ? 'Quórum' : 'Politeia'}`}>
      {isQuorum
        ? mobileLinks.map((link) => <MobileLink key={link.href} {...link} />)
        : <>
            {mobileLinks.slice(0, 3).map((link) => <MobileLink key={link.href} {...link} />)}
            <BlogNavLink compact latestPostAt={latestPostAt} />
            {mobileLinks.slice(4).map((link) => <MobileLink key={link.href} {...link} />)}
          </>}
    </nav>}
  </>;
}
