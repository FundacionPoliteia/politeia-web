'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const SESSION_KEY = 'politeia:newsletter-nudge-dismissed';
const INTERNAL_PATH_PREFIXES = ['/admin', '/internal', '/404'];

export default function PublicNewsletterNudge() {
  const pathname = usePathname();
  const timerRef = useRef(null);
  const phaseRef = useRef('idle');
  const [publicHost, setPublicHost] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    const internalHost = hostname === 'admin.politeia.ar' || hostname.startsWith('admin.localhost');
    setPublicHost(!internalHost);

    if (window.sessionStorage.getItem(SESSION_KEY) === 'true') {
      phaseRef.current = 'dismissed';
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const schedule = useCallback((delay) => {
    if (phaseRef.current !== 'idle') return;
    phaseRef.current = 'scheduled';
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      phaseRef.current = 'visible';
      setVisible(true);
    }, delay);
  }, []);

  const internalPath = INTERNAL_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const publicSurface = publicHost && !internalPath;

  useEffect(() => {
    if (!publicSurface || phaseRef.current !== 'idle') return undefined;
    if (window.location.hash === '#news') return undefined;

    if (pathname !== '/') {
      schedule(2500);
      return undefined;
    }

    const onScroll = () => {
      if (window.scrollY < 48) return;
      schedule(4500);
      window.removeEventListener('scroll', onScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname, publicSurface, schedule]);

  const dismiss = useCallback(() => {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
    phaseRef.current = 'dismissed';
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  if (!publicSurface || !visible) return null;

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
