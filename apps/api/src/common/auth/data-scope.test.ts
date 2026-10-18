import { describe, expect, it } from 'vitest';
import type { AuthUser } from './auth-user';
import { scopeWhere } from './data-scope';

const base: AuthUser = {
  id: 'u1',
  username: 'test',
  fullName: 'Test',
  sessionId: 's1',
  campusId: 'hn',
  unitId: 'k1',
  managedUnitIds: ['k2'],
  roles: [],
  permissions: new Set(),
  dataScope: 'ALL',
  mustChangePassword: false,
};
const fields = { campus: 'campusId', unit: 'unitId', self: 'id' };
const DENY = { id: { in: [] } };

describe('scopeWhere', () => {
  it('ALL → không lọc', () => {
    expect(scopeWhere(base, fields)).toEqual({});
  });

  it('CAMPUS → lọc theo cơ sở của tài khoản', () => {
    expect(scopeWhere({ ...base, dataScope: 'CAMPUS' }, fields)).toEqual({ campusId: 'hn' });
  });

  it('CAMPUS nhưng tài khoản không có cơ sở → chặn', () => {
    expect(scopeWhere({ ...base, dataScope: 'CAMPUS', campusId: null }, fields)).toEqual(DENY);
  });

  it('UNIT → đơn vị của mình + đơn vị phụ trách', () => {
    expect(scopeWhere({ ...base, dataScope: 'UNIT' }, fields)).toEqual({
      unitId: { in: ['k2', 'k1'] },
    });
  });

  it('UNIT nhưng không có đơn vị nào → chặn', () => {
    expect(
      scopeWhere({ ...base, dataScope: 'UNIT', unitId: null, managedUnitIds: [] }, fields),
    ).toEqual(DENY);
  });

  it('SELF → chỉ bản ghi của mình', () => {
    expect(scopeWhere({ ...base, dataScope: 'SELF' }, fields)).toEqual({ id: 'u1' });
  });

  it('bảng không có trường phạm vi tương ứng → chặn', () => {
    expect(scopeWhere({ ...base, dataScope: 'UNIT' }, { campus: 'campusId' })).toEqual(DENY);
  });
});
