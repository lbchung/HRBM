import { NextResponse, type NextRequest } from 'next/server';

/** Cookie gợi ý do API đặt khi đăng nhập (không chứa token). */
const SESSION_HINT = 'session_hint';
const PUBLIC_PATHS = ['/login'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_HINT);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!hasSession && !isPublic) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)'],
};
