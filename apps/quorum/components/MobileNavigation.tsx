'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const items = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/#proyectos', label: 'Proyectos', icon: 'account_balance' },
  { href: '/camino-de-la-ley', label: 'Camino de la ley', icon: 'route' },
  { href: '/glosario', label: 'Glosario', icon: 'menu_book' },
  { href: '/privacidad', label: 'Privacidad', icon: 'shield' },
];

export default function MobileNavigation() {
  const pathname = usePathname();
  const [projectsVisible, setProjectsVisible] = useState(false);

  useEffect(() => {
    setProjectsVisible(false);
    if (pathname !== '/') return;
    const projects = document.getElementById('proyectos');
    if (!projects) return;
    const observer = new IntersectionObserver(([entry]) => setProjectsVisible(entry.isIntersecting), {
      rootMargin: '-62px 0px -30% 0px',
    });
    observer.observe(projects);
    return () => observer.disconnect();
  }, [pathname]);

  if (pathname === '/acceso' || pathname === '/gestion' || pathname.startsWith('/gestion/')) return null;

  return <nav className="mobile-public-tabs" aria-label="Navegación móvil de Quórum">
    {items.map(({ href, label, icon }) => {
      const active = href === '/' ? pathname === '/' && !projectsVisible
        : href === '/#proyectos' ? pathname.startsWith('/proyectos/') || (pathname === '/' && projectsVisible)
          : pathname === href || pathname.startsWith(`${href}/`);
      return <Link href={href} key={href} className={`mobile-public-tab${active ? ' is-active' : ''}`}
        aria-current={active ? (href === '/#proyectos' && pathname === '/' ? 'location' : 'page') : undefined}>
        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </Link>;
    })}
  </nav>;
}
