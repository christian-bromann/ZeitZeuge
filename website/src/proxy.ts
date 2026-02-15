import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle .md suffix: /docs/cli.md → serve raw Markdown
  if (pathname.startsWith('/docs/') && pathname.endsWith('.md')) {
    const slug = pathname.replace('/docs/', '').replace(/\.md$/, '');
    const url = request.nextUrl.clone();
    url.pathname = `/api/docs/${slug}`;
    return NextResponse.rewrite(url);
  }

  // Content negotiation: if Accept header prefers text/markdown, serve Markdown
  const accept = request.headers.get('accept') || '';
  if (
    pathname.startsWith('/docs/') &&
    !pathname.startsWith('/docs/api') &&
    pathname !== '/docs' &&
    accept.includes('text/markdown')
  ) {
    const slug = pathname.replace('/docs/', '');
    const url = request.nextUrl.clone();
    url.pathname = `/api/docs/${slug}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/docs/:path*'],
};
