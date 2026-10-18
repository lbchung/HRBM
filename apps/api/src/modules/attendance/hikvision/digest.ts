import { createHash, randomBytes } from 'node:crypto';

/** HTTP Digest Authentication (RFC 2617/7616, MD5, qop=auth) — giao thức xác thực của Hikvision ISAPI. */
export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

export function parseDigestChallenge(header: string | null): DigestChallenge | null {
  if (!header || !/^Digest\s/i.test(header)) return null;
  const params: Record<string, string> = {};
  for (const m of header.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) params[m[1].toLowerCase()] = m[2] ?? m[3];
  if (!params.realm || !params.nonce) return null;
  return { realm: params.realm, nonce: params.nonce, qop: params.qop, opaque: params.opaque, algorithm: params.algorithm };
}

export function buildDigestHeader(
  c: DigestChallenge,
  opts: { username: string; password: string; method: string; uri: string; nc?: number; cnonce?: string },
): string {
  const nc = (opts.nc ?? 1).toString(16).padStart(8, '0');
  const cnonce = opts.cnonce ?? randomBytes(8).toString('hex');
  const ha1 = md5(`${opts.username}:${c.realm}:${opts.password}`);
  const ha2 = md5(`${opts.method}:${opts.uri}`);
  const qop = c.qop?.split(',').map((s) => s.trim()).includes('auth') ? 'auth' : undefined;
  const response = qop ? md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${c.nonce}:${ha2}`);
  const parts = [
    `username="${opts.username}"`,
    `realm="${c.realm}"`,
    `nonce="${c.nonce}"`,
    `uri="${opts.uri}"`,
    `response="${response}"`,
    ...(c.algorithm ? [`algorithm=${c.algorithm}`] : []),
    ...(c.opaque ? [`opaque="${c.opaque}"`] : []),
    ...(qop ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
  ];
  return `Digest ${parts.join(', ')}`;
}
