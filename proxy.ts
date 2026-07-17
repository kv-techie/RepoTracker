import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/repos')) {
    // Auth check can be added here later
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/repos/:path*', '/api/:path*'],
};