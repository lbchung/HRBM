import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
  /** Định dạng số/ngày, vd 'dd/mm/yyyy', '#,##0' */
  numFmt?: string;
}

export interface ExcelSheet<T> {
  name: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

export type CellValue = string | number | Date | null;

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008046' } };

/** Đọc giá trị ô ExcelJS về dạng đơn giản. */
function cellValue(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
  }
  return String(v);
}

@Injectable()
export class ExcelService {
  // Mỗi sheet có kiểu dòng riêng — mảng không đồng nhất nên không gom được về một T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async build(sheets: ExcelSheet<any>[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HRM Bệnh viện Bạch Mai';
    wb.created = new Date();
    for (const s of sheets) {
      const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = s.columns.map((c) => ({ header: c.header, width: c.width ?? 18, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
      const header = ws.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = HEADER_FILL;
      header.alignment = { vertical: 'middle', wrapText: true };
      header.height = 30;
      for (const row of s.rows) ws.addRow(s.columns.map((c) => c.value(row) ?? null));
      if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  send(res: Response, filename: string, buffer: Buffer) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  }

  /** Đọc sheet đầu tiên: dòng 1 là tiêu đề. Bỏ qua dòng trống. */
  async parse(buffer: Buffer): Promise<{ headers: string[]; rows: { rowNumber: number; values: Record<string, CellValue> }[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(cellValue(cell.value) ?? '').trim();
    });
    const rows: { rowNumber: number; values: Record<string, CellValue> }[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: Record<string, CellValue> = {};
      let hasValue = false;
      headers.forEach((h, i) => {
        if (!h) return;
        const v = cellValue(row.getCell(i + 1).value);
        const normalized = typeof v === 'string' ? v.trim() || null : v;
        if (normalized !== null) hasValue = true;
        values[h] = normalized;
      });
      if (hasValue) rows.push({ rowNumber, values });
    });
    return { headers, rows };
  }
}
