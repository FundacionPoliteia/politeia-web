'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const SESSION_KEY = 'politeia:newsletter-nudge-dismissed';
const MOBILE_QUERY = '(max-width: 860px)';

export default function PublicNewsletterNudge() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (!window.matchMedia(MOBILE_QUERY).matches) return undefined;
    if (window.sessionStorage.getItem(SESSION_KEY) === 'true') return undefined;
    if (window.location.hash === '#news') return undefined;

    let timer = null;
    const schedule = (delay) => {
      if (timer) return;
      timer = window.setTimeout(() => setVisible(true), delay);
    };

    if (pathname !== '/') {
      schedule(2500);
      return () => window.clearTimeout(timer);
    }

    const onScroll = () => {
      if (window.scrollY < 48) return;
      schedule(4500);
      window.removeEventListener('scroll', onScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [pathname]);

  const dismiss = useCallback(() => {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <aside aria-label="Invitación al newsletter" className="public-newsletter-nudge" role="region">
      <button aria-label="Cerrar invitación" className="public-newsletter-nudge-close" onClick={dismiss} type="button">
        <span aria-hidden="true" className="material-symbols-outlined">close</span>
      </button>
      <span aria-hidden="true" className="public-newsletter-nudge-icon material-symbols-outlined">mail</span>
      <div>
        <strong>¿Querés recibir todas las novedades?</strong>
        <p>Notas y proyectos de Politeia, directo en tu correo.</p>
      </div>
      <Link className="public-newsletter-nudge-link" href="/#news" onClick={dismiss}>
        Suscribirme
        <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
      </Link>
    </aside>
  );
}
