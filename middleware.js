import { NextResponse } from 'next/server';

const ADMIN_HOSTS = new Set(['admin.politeia.ar', 'admin.localhost']);

function hostnameFromRequest(request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || '';
  return host.toLowerCase().split(':')[0];
}

function isAdminHost(hostname) {
  return ADMIN_HOSTS.has(hostname);
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const hostname = hostnameFromRequest(request);
  const adminHost = isAdminHost(hostname);

  if (pathname.startsWith('/admin')) {
    if (!adminHost) {
      return NextResponse.rewrite(new URL('/404', request.url), { status: 404 });
    }
    return NextResponse.next();
  }

  if (adminHost) {
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
