'use client';

import { useState } from 'react';
import { photoUrlSchema } from '@politeia/quorum-contracts';
import { publicApiBase } from '@/lib/api';

export default function PersonPhoto({ url, name, large = false }: { url?: string; name: string; large?: boolean }) {
  const [failed, setFailed] = useState('');
  const valid = Boolean(url && photoUrlSchema.safeParse(url).success && failed !== url);
  let source = url;
  if (valid && url) {
    const parsed = new URL(url);
    // Uploaded media must use the authenticated same-origin proxy during private testing.
    if (parsed.origin === process.env.NEXT_PUBLIC_QUORUM_MEDIA_ORIGIN && /^\/v1\/public\/media\/[^/]+$/.test(parsed.pathname)) source = `${publicApiBase.replace(/\/$/, '')}${parsed.pathname}`;
  }
  return <span className={`person-photo${large ? ' person-photo-large' : ''}`} aria-hidden="true">
    {valid ? <img src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(url || '')} /> : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}
  </span>;
}
