import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
/** Cookie không nhạy cảm để frontend (middleware Next.js) biết đang có phiên đăng nhập. */
export const SESSION_HINT_COOKIE = 'session_hint';

const REFRESH_PATH = '/api/v1/auth';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  sessionMaxAgeMs: number;
}

const base = (secure: boolean): CookieOptions => ({ sameSite: 'strict', secure, path: '/' });

export function setAuthCookies(res: Response, t: IssuedTokens, secure: boolean) {
  res.cookie(ACCESS_COOKIE, t.accessToken, { ...base(secure), httpOnly: true, maxAge: t.accessMaxAgeMs });
  res.cookie(REFRESH_COOKIE, t.refreshToken, {
    ...base(secure),
    httpOnly: true,
    path: REFRESH_PATH,
    maxAge: t.sessionMaxAgeMs,
  });
  res.cookie(SESSION_HINT_COOKIE, '1', { ...base(secure), httpOnly: false, maxAge: t.sessionMaxAgeMs });
}

export function clearAuthCookies(res: Response, secure: boolean) {
  res.clearCookie(ACCESS_COOKIE, { ...base(secure), httpOnly: true });
  res.clearCookie(REFRESH_COOKIE, { ...base(secure), httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(SESSION_HINT_COOKIE, base(secure));
}
