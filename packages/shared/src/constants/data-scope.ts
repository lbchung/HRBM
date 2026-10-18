/** Phạm vi dữ liệu của nhóm tài khoản. */
export const DATA_SCOPES = ['ALL', 'CAMPUS', 'UNIT', 'SELF'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  ALL: 'Toàn viện',
  CAMPUS: 'Theo cơ sở',
  UNIT: 'Theo đơn vị',
  SELF: 'Chỉ bản thân',
};

/** Thứ tự rộng → hẹp; dùng để chọn phạm vi rộng nhất khi tài khoản thuộc nhiều nhóm. */
const SCOPE_RANK: Record<DataScope, number> = { ALL: 3, CAMPUS: 2, UNIT: 1, SELF: 0 };

export function widestScope(scopes: DataScope[]): DataScope {
  return scopes.reduce<DataScope>(
    (widest, s) => (SCOPE_RANK[s] > SCOPE_RANK[widest] ? s : widest),
    'SELF',
  );
}
