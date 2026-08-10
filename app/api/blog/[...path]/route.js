import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = [
  'cache-control',
  'content-disposition',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
];

async function proxyRequest(request, { params }) {
  const backendBase = serverApiBase();
  if (!backendBase) {
    return NextResponse.json(
      { error: { message: 'BLOG_API_BASE_URL is not configured' } },
      { status: 503 },
    );
  }

  const resolvedParams = await params;
  const path = Array.isArray(resolvedParams?.path) ? resolvedParams.path.join('/') : '';
  const upstreamUrl = new URL(`${backendBase}/${path}`);
  upstreamUrl.search = new URL(request.url).search;

  const headers = forwardedHeaders(request.headers);
  const method = request.method.toUpperCase();
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await request.arrayBuffer();
  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) responseHeaders.set('set-cookie', setCookie);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function serverApiBase() {
  const value = process.env.BLOG_API_BASE_URL || process.env.NEXT_PUBLIC_BLOG_API_BASE_URL || '';
  if (!/^https?:\/\//i.test(value)) return '';
  return value.replace(/\/$/, '');
}

function forwardedHeaders(source) {
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie', 'idempotency-key', 'origin', 'user-agent']) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
