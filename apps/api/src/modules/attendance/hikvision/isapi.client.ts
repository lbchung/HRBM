import { randomUUID } from 'node:crypto';
import { buildDigestHeader, parseDigestChallenge } from './digest';

/** Sự kiện chấm công đã chuẩn hóa — không phụ thuộc hãng máy. */
export interface DeviceEvent {
  serialNo: number;
  employeeNo: string;
  time: Date;
  minor: number;
  verifyMode: string | null;
  name: string | null;
}

export interface DeviceConnection {
  host: string;
  port: number;
  useHttps: boolean;
  username: string;
  password: string;
}

/**
 * Nguồn sự kiện chấm công. Hiện thực: Hikvision ISAPI trực tiếp.
 * Có thể thay bằng HikCentral OpenAPI với cùng interface.
 */
export interface DeviceEventSource {
  deviceInfo(): Promise<{ model: string | null; serialNumber: string | null; firmware: string | null }>;
  deviceTime(): Promise<Date | null>;
  fetchEvents(from: Date, to: Date, minors: number[], onPage?: (count: number) => void): Promise<DeviceEvent[]>;
}

const PAGE_SIZE = 30; // giới hạn phổ biến của firmware Hikvision cho AcsEvent
const MAX_PAGES = 2000;

/** ISO có offset +07:00 như firmware Hikvision yêu cầu */
function isoVn(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 19);
  return `${t}+07:00`;
}

const xmlValue = (xml: string, tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null;

export class HikvisionIsapiClient implements DeviceEventSource {
  private nc = 0;

  constructor(
    private readonly conn: DeviceConnection,
    private readonly timeoutMs = 10_000,
  ) {}

  private get base() {
    return `${this.conn.useHttps ? 'https' : 'http'}://${this.conn.host}:${this.conn.port}`;
  }

  /** Gửi request với Digest auth: lần 1 nhận thử thách 401, lần 2 gửi kèm chữ ký. */
  private async request(method: 'GET' | 'POST', path: string, body?: string): Promise<string> {
    const send = (auth?: string) =>
      fetch(this.base + path, {
        method,
        body,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    let res = await send();
    if (res.status === 401) {
      const challenge = parseDigestChallenge(res.headers.get('www-authenticate'));
      if (!challenge) throw new Error('Máy không hỗ trợ xác thực Digest');
      await res.arrayBuffer().catch(() => undefined);
      res = await send(
        buildDigestHeader(challenge, { ...this.conn, method, uri: path, nc: ++this.nc }),
      );
      if (res.status === 401) throw new Error('Sai tài khoản hoặc mật khẩu máy chấm công');
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Máy trả lỗi HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text;
  }

  async deviceInfo() {
    const xml = await this.request('GET', '/ISAPI/System/deviceInfo');
    return { model: xmlValue(xml, 'model'), serialNumber: xmlValue(xml, 'serialNumber'), firmware: xmlValue(xml, 'firmwareVersion') };
  }

  async deviceTime() {
    const xml = await this.request('GET', '/ISAPI/System/time');
    const local = xmlValue(xml, 'localTime');
    const d = local ? new Date(local) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }

  /** Lấy sự kiện kiểm soát ra vào (major 5) theo từng mã minor, phân trang đến hết. */
  async fetchEvents(from: Date, to: Date, minors: number[], onPage?: (count: number) => void): Promise<DeviceEvent[]> {
    const out: DeviceEvent[] = [];
    for (const minor of minors) {
      const searchID = randomUUID();
      let position = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const body = JSON.stringify({
          AcsEventCond: {
            searchID,
            searchResultPosition: position,
            maxResults: PAGE_SIZE,
            major: 5,
            minor,
            startTime: isoVn(from),
            endTime: isoVn(to),
          },
        });
        const json = JSON.parse(await this.request('POST', '/ISAPI/AccessControl/AcsEvent?format=json', body));
        const ev = json?.AcsEvent;
        const list: Record<string, unknown>[] = ev?.InfoList ?? [];
        for (const it of list) {
          const employeeNo = String(it.employeeNoString ?? it.employeeNo ?? '').trim();
          const time = new Date(String(it.time));
          if (!employeeNo || Number.isNaN(time.getTime()) || typeof it.serialNo !== 'number') continue;
          out.push({
            serialNo: it.serialNo,
            employeeNo,
            time,
            minor: Number(it.minor ?? minor),
            verifyMode: (it.currentVerifyMode as string) ?? null,
            name: (it.name as string) ?? null,
          });
        }
        onPage?.(list.length);
        position += list.length;
        if (ev?.responseStatusStrg !== 'MORE' || list.length === 0) break;
      }
    }
    return out;
  }
}
