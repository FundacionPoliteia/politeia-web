import { NextResponse } from 'next/server';

const ADMIN_HOSTS = new Set(['admin.politeia.ar', 'admin.localhost']);
const ENABLE_PREVIEW_ADMIN = process.env.ENABLE_PREVIEW_ADMIN === 'true';

function hostnameFromRequest(request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || '';
  return host.toLowerCase().split(':')[0];
}

function isAdminOnlyHost(hostname) {
  return ADMIN_HOSTS.has(hostname);
}

function isAllowedPreviewHost(hostname) {
  return ENABLE_PREVIEW_ADMIN && process.env.VERCEL_ENV === 'preview' && hostname.endsWith('.vercel.app');
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const hostname = hostnameFromRequest(request);
  const adminOnlyHost = isAdminOnlyHost(hostname);
  const canRenderAdmin = adminOnlyHost || isAllowedPreviewHost(hostname);

  if (pathname.startsWith('/admin')) {
    if (!canRenderAdmin) {
      return NextResponse.rewrite(new URL('/404', request.url), { status: 404 });
    }
    return NextResponse.next();
  }

  if (adminOnlyHost) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)'],
};
