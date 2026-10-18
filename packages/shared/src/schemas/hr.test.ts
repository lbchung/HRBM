import { describe, expect, it } from 'vitest';
import { createEmployeeSchema, EMPLOYEE_SUB_RESOURCE_SCHEMAS, SUB_RECORD_RULES } from './hr';

const base = {
  code: 'nv001',
  fullName: 'Nguyễn Văn A',
  gender: 'MALE',
  campusId: '11111111-1111-4111-8111-111111111111',
  unitId: '22222222-2222-4222-8222-222222222222',
};

describe('createEmployeeSchema', () => {
  it('mã nhân viên viết hoa, chuỗi rỗng → null', () => {
    const r = createEmployeeSchema.parse({ ...base, phone: '', idNumber: '', dateOfBirth: '' });
    expect(r.code).toBe('NV001');
    expect(r.phone).toBeNull();
    expect(r.idNumber).toBeNull();
    expect(r.dateOfBirth).toBeNull();
  });

  it('ngày sinh YYYY-MM-DD → Date UTC', () => {
    const r = createEmployeeSchema.parse({ ...base, dateOfBirth: '1990-05-20' });
    expect(r.dateOfBirth?.toISOString()).toBe('1990-05-20T00:00:00.000Z');
  });

  it.each([
    ['idNumber', '12345'],
    ['taxCode', 'abc'],
    ['bankAccountNo', '12-34'],
    ['dateOfBirth', '20/05/1990'],
    ['email', 'khong-hop-le'],
  ])('từ chối %s = %s', (field, value) => {
    expect(createEmployeeSchema.safeParse({ ...base, [field]: value }).success).toBe(false);
  });

  it('chấp nhận CCCD 12 số và MST 10 số', () => {
    expect(createEmployeeSchema.safeParse({ ...base, idNumber: '001203004567', taxCode: '0101234567' }).success).toBe(true);
  });
});

describe('hồ sơ con', () => {
  it('năm sinh rỗng → null (không thành 0)', () => {
    const r = EMPLOYEE_SUB_RESOURCE_SCHEMAS.family.parse({ relationshipCode: 'CON', fullName: 'A', birthYear: '' });
    expect(r.birthYear).toBeNull();
  });

  it('hệ số lương giữ nguyên dạng chuỗi thập phân', () => {
    const r = EMPLOYEE_SUB_RESOURCE_SCHEMAS.salaries.parse({ effectiveFrom: '2024-07-01', salaryForm: 'COEFFICIENT', coefficient: '4,98' });
    expect(r.coefficient).toBe('4.98');
  });

  it('ràng buộc: lương hệ số phải có hệ số', () => {
    const errs = SUB_RECORD_RULES.salaries.map((f) => f({ salaryForm: 'COEFFICIENT', coefficient: null })).filter(Boolean);
    expect(errs).toContain('Nhập hệ số lương');
  });

  it('ràng buộc: phân công đến ngày < từ ngày', () => {
    const r = { fromDate: new Date('2026-10-10'), toDate: new Date('2026-10-01') };
    expect(SUB_RECORD_RULES.assignments[0](r)).toBe('Đến ngày phải sau từ ngày');
  });
});
