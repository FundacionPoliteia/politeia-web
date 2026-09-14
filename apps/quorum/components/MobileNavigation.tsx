'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const items = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/#proyectos', label: 'Proyectos', icon: 'account_balance' },
  { href: '/camino-de-la-ley', label: 'Camino de la ley', icon: 'route' },
  { href: '/glosario', label: 'Glosario', icon: 'menu_book' },
  { href: '/nosotros', label: 'Nosotros', icon: 'groups' },
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
        {href === '/nosotros' ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" /></svg> : <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>}
        <span>{label}</span>
      </Link>;
    })}
  </nav>;
}
