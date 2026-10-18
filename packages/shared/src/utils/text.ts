/**
 * Chuẩn hóa chuỗi để tìm kiếm không dấu: "Nguyễn Văn Đức" → "nguyen van duc".
 * Dùng cho cột `search_text` — tìm "nguyen van" ra "Nguyễn Văn".
 */
export function normalizeSearch(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Che thông tin nhạy cảm: "001203004567" → "********4567". */
export function maskSensitive(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
