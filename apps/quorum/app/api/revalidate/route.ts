import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_REVALIDATE_SECRET || request.headers.get('x-revalidate-secret') !== process.env.NEXT_REVALIDATE_SECRET) {
    return NextResponse.json({ error: { code: 'invalid_secret', message: 'Token inválido' } }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { slug?: string };
  revalidateTag('quorum-public');
  if (body.slug) revalidateTag(`quorum-project-${body.slug}`);
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
