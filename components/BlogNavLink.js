'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'politeia.blog.lastSeenAt';

export default function BlogNavLink({ latestPostAt = '' }) {
  const pathname = usePathname();
  const [showDot, setShowDot] = useState(false);
  const latestPostMs = useMemo(() => toTime(latestPostAt), [latestPostAt]);

  useEffect(() => {
    if (!latestPostMs) {
      setShowDot(false);
      return;
    }

    const isBlogPath = pathname === '/blog' || pathname?.startsWith('/blog/');

    if (isBlogPath) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      setShowDot(false);
      return;
    }

    const lastSeenMs = Number(localStorage.getItem(STORAGE_KEY) || 0);
    setShowDot(!lastSeenMs || latestPostMs > lastSeenMs);
  }, [latestPostMs, pathname]);

  return (
    <Link href="/blog" className="nav-blog-link">
      Blog
      {showDot && <span aria-label="Hay una nota nueva" className="nav-new-dot" />}
    </Link>
  );
}

function toTime(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
