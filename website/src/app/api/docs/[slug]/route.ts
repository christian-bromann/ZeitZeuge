import { NextRequest, NextResponse } from 'next/server';
import { getRawMarkdown } from '@/lib/docs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const md = getRawMarkdown(slug);
  if (!md) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
