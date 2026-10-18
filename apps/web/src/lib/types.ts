/**
 * Bản ghi JSON từ API có cấu trúc động — dùng cho form/bảng sinh tự động từ FieldDef,
 * nơi tên trường chỉ biết lúc chạy. Kiểu cụ thể vẫn ưu tiên khi biết trước cấu trúc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRecord = Record<string, any>;
