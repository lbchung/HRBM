import { describe, expect, it } from 'vitest';
import { buildDigestHeader, parseDigestChallenge } from './digest';

describe('HTTP Digest', () => {
  // Ví dụ chuẩn trong RFC 2617 mục 3.5
  const header =
    'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';

  it('đọc thử thách từ máy', () => {
    expect(parseDigestChallenge(header)).toEqual({
      realm: 'testrealm@host.com',
      nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
      qop: 'auth,auth-int',
      opaque: '5ccc069c403ebaf9f0171e9517f40e41',
      algorithm: undefined,
    });
  });

  it('tính đúng response theo RFC 2617', () => {
    const h = buildDigestHeader(parseDigestChallenge(header)!, {
      username: 'Mufasa',
      password: 'Circle Of Life',
      method: 'GET',
      uri: '/dir/index.html',
      nc: 1,
      cnonce: '0a4f113b',
    });
    expect(h).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(h).toContain('qop=auth');
    expect(h).toContain('nc=00000001');
  });

  it('không phải Digest → null', () => {
    expect(parseDigestChallenge('Basic realm="x"')).toBeNull();
    expect(parseDigestChallenge(null)).toBeNull();
  });
});
