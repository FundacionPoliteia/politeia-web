import { NextRequest, NextResponse } from 'next/server';

const managementHosts = new Set((process.env.GESTION_HOSTS || 'gestion.quorum.politeia.ar,gestion.staging.quorum.politeia.ar,gestion.localhost').split(',').map((item) => item.trim().toLowerCase()));
const stagingHosts = new Set((process.env.STAGING_HOSTS || 'staging.quorum.politeia.ar,gestion.staging.quorum.politeia.ar').split(',').map((item) => item.trim().toLowerCase()));
const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'quorum_session';

export async function middleware(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(':')[0].toLowerCase();
  const management = managementHosts.has(host);
  const staging = stagingHosts.has(host);
  const pathname = request.nextUrl.pathname;
  const publicAccessRequired = process.env.PUBLIC_ACCESS_REQUIRED === 'true' || (staging && process.env.STAGING_ACCESS_REQUIRED === 'true');

  if (!management && publicAccessRequired && pathname !== '/acceso' && !pathname.startsWith('/api/')) {
    const session = request.cookies.get(sessionCookieName)?.value || '';
    if (!(await hasValidSession(session))) {
      const url = request.nextUrl.clone();
      url.pathname = '/acceso';
      url.search = '';
      url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      const response = NextResponse.redirect(url);
      response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
      return response;
    }
  }

  if (management && !pathname.startsWith('/gestion')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/gestion' : `/gestion${pathname}`;
    const response = NextResponse.rewrite(url);
    if (staging) response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
    return response;
  }

  if (!management && pathname.startsWith('/gestion') && !host.includes('localhost') && !staging) {
    return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
  }

  const response = NextResponse.next();
  if (staging || publicAccessRequired) response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  return response;
}

async function hasValidSession(token: string) {
  const secret = process.env.SESSION_SECRET || '';
  if (!token || secret.length < 32) return false;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlBytes(signature), new TextEncoder().encode(payload));
    if (!valid) return false;
    const value = JSON.parse(new TextDecoder().decode(base64UrlBytes(payload))) as { exp?: number };
    return typeof value.exp === 'number' && value.exp > Date.now();
  } catch {
    return false;
  }
}

function base64UrlBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'] };
