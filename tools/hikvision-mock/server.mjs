// Máy chấm công Face ID giả lập — tương thích Hikvision ISAPI (Digest auth, AcsEvent phân trang).
// Dùng để phát triển / kiểm thử khi chưa có máy thật.
//
//   node tools/hikvision-mock/server.mjs --port 8091 --user admin --pass Mock@1234 [--offset-seconds 0]
//
// Thêm lượt quét (không cần xác thực):
//   POST http://127.0.0.1:8091/mock/punch  {"employeeNo":"NV001","time":"2026-10-19T07:25:00+07:00"}
//   POST http://127.0.0.1:8091/mock/reset
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const PORT = Number(args.port ?? 8091);
const USER = args.user ?? 'admin';
const PASS = args.pass ?? 'Mock@1234';
const OFFSET = Number(args['offset-seconds'] ?? 0) * 1000;
const REALM = 'DS-K1T341 Mock';
const PAGE = 30;

let serial = 1000;
let events = [];
const nonces = new Set();
const md5 = (s) => createHash('md5').update(s).digest('hex');

function checkAuth(req) {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Digest ')) return false;
  const p = {};
  for (const m of h.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) p[m[1]] = m[2] ?? m[3];
  if (p.username !== USER || !nonces.has(p.nonce)) return false;
  const ha1 = md5(`${USER}:${REALM}:${PASS}`);
  const ha2 = md5(`${req.method}:${p.uri}`);
  const expected = p.qop ? md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
  return p.response === expected;
}

function challenge(res) {
  const nonce = randomBytes(16).toString('hex');
  nonces.add(nonce);
  res.writeHead(401, { 'WWW-Authenticate': `Digest realm="${REALM}", qop="auth", nonce="${nonce}", opaque="${randomBytes(8).toString('hex')}"` });
  res.end();
}

const isoVn = (d) => `${new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 19)}+07:00`;
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  // ---- Điều khiển giả lập ----
  if (url.pathname === '/mock/punch' && req.method === 'POST') {
    const b = JSON.parse((await readBody(req)) || '{}');
    const list = Array.isArray(b) ? b : [b];
    const added = list.map((x) => {
      const ev = { serialNo: ++serial, employeeNo: String(x.employeeNo), time: x.time ? new Date(x.time) : new Date(), name: x.name ?? null, minor: x.minor ?? 75 };
      events.push(ev);
      return { serialNo: ev.serialNo, time: isoVn(ev.time) };
    });
    return send(200, { added });
  }
  if (url.pathname === '/mock/reset' && req.method === 'POST') {
    events = [];
    return send(200, { ok: true });
  }
  if (url.pathname === '/mock/events') return send(200, { count: events.length, serial });

  // ---- ISAPI ----
  if (!checkAuth(req)) return challenge(res);

  if (url.pathname === '/ISAPI/System/deviceInfo') {
    return send(200, `<?xml version="1.0" encoding="UTF-8"?><DeviceInfo><deviceName>Mock</deviceName><model>DS-K1T341CMF-MOCK</model><serialNumber>MOCK${PORT}</serialNumber><firmwareVersion>V3.2.30 build 230101</firmwareVersion></DeviceInfo>`, 'application/xml');
  }
  if (url.pathname === '/ISAPI/System/time') {
    return send(200, `<?xml version="1.0" encoding="UTF-8"?><Time><timeMode>NTP</timeMode><localTime>${isoVn(new Date(Date.now() + OFFSET))}</localTime><timeZone>CST-7:00:00</timeZone></Time>`, 'application/xml');
  }
  if (url.pathname === '/ISAPI/AccessControl/AcsEvent' && req.method === 'POST') {
    const cond = JSON.parse(await readBody(req)).AcsEventCond;
    const from = new Date(cond.startTime);
    const to = new Date(cond.endTime);
    const matched = events
      .filter((e) => e.minor === cond.minor && e.time >= from && e.time <= to)
      .sort((a, b) => a.time - b.time);
    const pos = cond.searchResultPosition ?? 0;
    const size = Math.min(cond.maxResults ?? PAGE, PAGE);
    const page = matched.slice(pos, pos + size);
    return send(200, {
      AcsEvent: {
        searchID: cond.searchID,
        totalMatches: matched.length,
        responseStatusStrg: matched.length === 0 ? 'NO MATCH' : pos + page.length < matched.length ? 'MORE' : 'OK',
        numOfMatches: page.length,
        InfoList: page.map((e) => ({
          major: 5,
          minor: e.minor,
          time: isoVn(e.time),
          employeeNoString: e.employeeNo,
          name: e.name ?? undefined,
          serialNo: e.serialNo,
          currentVerifyMode: 'face',
          attendanceStatus: 'undefined',
        })),
      },
    });
  }
  send(404, { statusCode: 4, statusString: 'Invalid Operation' });
}).listen(PORT, '127.0.0.1', () => console.log(`Máy chấm công giả lập: http://127.0.0.1:${PORT} (tài khoản ${USER})`));
