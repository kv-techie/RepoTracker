import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** "localhost:3000" -> "localhost", "[::1]:3000" -> "[::1]" */
function hostnameOf(host: string | null): string {
  if (!host) return '';
  const lower = host.toLowerCase();
  return lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0];
}

/**
 * Access rules:
 * - Signed in with GitHub: everything.
 * - Not signed in, on this machine (loopback Host): local mode. Local data works offline;
 *   GitHub features stay empty until sign-in. The dev server binds to 127.0.0.1, and
 *   checking the Host header also blocks DNS-rebinding pages from reaching the API.
 * - Anything else: pages redirect to /login, APIs answer 401.
 */
export default async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  // Read the raw Host header: nextUrl.hostname reflects the bound address, not what the client sent
  if (LOOPBACK_HOSTS.has(hostnameOf(request.headers.get('host')))) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('callbackUrl', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/repos/:path*',
    '/insights/:path*',
    '/settings/:path*',
    '/recruiter/:path*',
    '/api/agent/:path*',
    '/api/github/:path*',
    '/api/metrics/:path*',
  ],
};
