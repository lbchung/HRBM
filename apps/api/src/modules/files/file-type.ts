/** Định dạng được phép tải lên: phần mở rộng → MIME + chữ ký đầu file (magic bytes). */
const SIGNATURES = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF
  zip: [[0x50, 0x4b, 0x03, 0x04]], // docx, xlsx
  ole: [[0xd0, 0xcf, 0x11, 0xe0]], // doc, xls
};

export const ALLOWED_TYPES: Record<string, { mime: string; sig: keyof typeof SIGNATURES; inline: boolean }> = {
  '.pdf': { mime: 'application/pdf', sig: 'pdf', inline: true },
  '.png': { mime: 'image/png', sig: 'png', inline: true },
  '.jpg': { mime: 'image/jpeg', sig: 'jpg', inline: true },
  '.jpeg': { mime: 'image/jpeg', sig: 'jpg', inline: true },
  '.webp': { mime: 'image/webp', sig: 'webp', inline: true },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: 'zip', inline: false },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sig: 'zip', inline: false },
  '.doc': { mime: 'application/msword', sig: 'ole', inline: false },
  '.xls': { mime: 'application/vnd.ms-excel', sig: 'ole', inline: false },
};

/** Trả về định dạng nếu nội dung file khớp phần mở rộng; null nếu không hợp lệ (chống đổi đuôi file). */
export function detectAllowedType(ext: string, buffer: Buffer) {
  const def = ALLOWED_TYPES[ext.toLowerCase()];
  if (!def) return null;
  const ok = SIGNATURES[def.sig].some((sig) => sig.every((b, i) => buffer[i] === b));
  return ok ? def : null;
}
