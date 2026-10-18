export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Record<string, string[]>,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
}

const NO_REFRESH = ['/auth/login', '/auth/login/2fa', '/auth/refresh'];

let refreshing: Promise<boolean> | null = null;

/** Gộp các lần refresh đồng thời thành một request. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function toQueryString(query?: Query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function redirectToLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
}

/** Gửi request, tự làm mới phiên khi access token hết hạn. */
async function request(path: string, init: RequestInit): Promise<Response> {
  const url = `/api/v1${path}`;
  const res = await fetch(url, { ...init, credentials: 'include' });
  const bare = path.split('?')[0];
  if (res.status === 401 && !NO_REFRESH.includes(bare)) {
    if (await refreshSession()) return fetch(url, { ...init, credentials: 'include' });
    redirectToLogin();
    throw new ApiError(401, 'Phiên đăng nhập đã hết hạn');
  }
  return res;
}

async function toError(res: Response): Promise<ApiError> {
  const data = await res.json().catch(() => null);
  if (res.status === 403 && data?.code === 'MUST_CHANGE_PASSWORD') window.location.href = '/change-password';
  return new ApiError(res.status, data?.message ?? 'Có lỗi xảy ra, vui lòng thử lại', data?.errors, data?.code);
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await request(`${path}${toQueryString(opts.query)}`, {
    method: opts.method ?? 'GET',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw await toError(res);
  return (res.status === 204 ? null : await res.json().catch(() => null)) as T;
}

/** Tải lên một file (multipart, trường "file"). */
export async function uploadFile<T>(path: string, file: File, query?: Query): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await request(`${path}${toQueryString(query)}`, { method: 'POST', body: form });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

/** Tải file về máy (xuất Excel, file đính kèm). Tên file lấy từ Content-Disposition. */
export async function downloadFile(path: string, query?: Query, fallbackName = 'tai-ve') {
  const res = await request(`${path}${toQueryString(query)}`, { method: 'GET' });
  if (!res.ok) throw await toError(res);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Đường dẫn xem file trực tiếp (ảnh, PDF) — cookie phiên đi kèm vì cùng origin. */
export const fileUrl = (id: string) => `/api/v1/files/${id}`;
