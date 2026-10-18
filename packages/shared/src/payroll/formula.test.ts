import { describe, expect, it } from 'vitest';
import { evaluateFormula, formulaVariables, validateFormula } from './formula';

const ev = (f: string, vars = {}, fns = {}) => evaluateFormula(f, vars, fns).toString();

describe('bộ tính công thức', () => {
  it.each([
    ['1 + 2 * 3', '7'],
    ['(1 + 2) * 3', '9'],
    ['10 / 4', '2.5'],
    ['-5 + 2', '-3'],
    ['2 - -3', '5'],
    ['0.1 + 0.2', '0.3'],
    ['10 / 0', '0'],
    ['3 > 2', '1'],
    ['3 <= 2', '0'],
    ['2 == 2', '1'],
  ])('%s = %s', (f, r) => {
    expect(ev(f)).toBe(r);
  });

  it('biến và hàm', () => {
    const vars = { BASE_SALARY: 2340000, COEF: '4.98', BEYOND_PCT: 7 };
    expect(ev('BASE_SALARY * COEF', vars)).toBe('11653200');
    expect(ev('round(BASE_SALARY * COEF * BEYOND_PCT / 100)', vars)).toBe('815724');
    expect(ev('min(10, 3, 7)')).toBe('3');
    expect(ev('max(1, 9)')).toBe('9');
    expect(ev('round(2.345, 2)')).toBe('2.35');
    expect(ev('if(COEF > 4, 1, 2)', vars)).toBe('1');
  });

  it('if chỉ tính nhánh được chọn (nhánh kia có thể lỗi)', () => {
    expect(ev('if(1, 5, KHONG_CO)')).toBe('5');
  });

  it('hàm do bên gọi cung cấp', () => {
    expect(ev('SUM_EARNINGS() * 2', {}, { SUM_EARNINGS: () => 100 })).toBe('200');
  });

  it('báo lỗi rõ ràng', () => {
    expect(() => ev('KHONG_CO + 1')).toThrow('Biến chưa định nghĩa');
    expect(() => ev('1 +')).toThrow();
    expect(() => ev('(1 + 2')).toThrow('Thiếu');
    expect(() => ev('1 ; 2')).toThrow('Ký tự không hợp lệ');
    expect(() => ev('eval(1)')).toThrow('Hàm không hỗ trợ');
  });

  it('không cho chèn mã JavaScript', () => {
    expect(() => ev('constructor.constructor("return 1")()')).toThrow();
    expect(() => ev('process')).toThrow('Biến chưa định nghĩa');
  });

  it('liệt kê biến & kiểm tra hợp lệ', () => {
    expect(formulaVariables('BASE_SALARY * (COEF + ALLOW_CHUC_VU)').sort()).toEqual(['ALLOW_CHUC_VU', 'BASE_SALARY', 'COEF']);
    const known = new Set(['A', 'B']);
    expect(validateFormula('A + B', known)).toBeNull();
    expect(validateFormula('A + C', known)).toBe('Biến không tồn tại: C');
    expect(validateFormula('foo(A)', known)).toBe('Hàm không hỗ trợ: foo');
    expect(validateFormula('SUM_EARNINGS()', known, ['SUM_EARNINGS'])).toBeNull();
  });
});
