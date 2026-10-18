import { z } from 'zod';
import { APPROVAL_STATUS_LABELS, APPROVAL_TARGET_TYPES, APPROVER_TYPES } from '../constants/approval';
import { nullableUuid, optionalText, paginationSchema, uuidSchema } from './common';

const stepSchema = z
  .object({
    name: z.string().trim().min(1, 'Nhập tên bước').max(200),
    approverType: z.enum(Object.keys(APPROVER_TYPES) as [string, ...string[]]),
    roleId: nullableUuid,
  })
  .refine((s) => s.approverType !== 'ROLE' || !!s.roleId, { message: 'Chọn nhóm tài khoản duyệt', path: ['roleId'] });

export const upsertWorkflowSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Mã chỉ gồm chữ in hoa không dấu, số, gạch dưới'),
  name: z.string().trim().min(1, 'Nhập tên quy trình').max(200),
  targetType: z.enum(Object.keys(APPROVAL_TARGET_TYPES) as [string, ...string[]]),
  description: optionalText(500),
  isActive: z.boolean().default(true),
  steps: z.array(stepSchema).min(1, 'Quy trình phải có ít nhất một bước').max(10),
});
export type UpsertWorkflowInput = z.infer<typeof upsertWorkflowSchema>;

/** Gửi tờ trình chung (targetType GENERAL). Module khác gọi engine trực tiếp ở backend. */
export const submitGeneralRequestSchema = z.object({
  workflowCode: z.string().min(1),
  title: z.string().trim().min(1, 'Nhập tiêu đề').max(300),
  content: optionalText(5000),
  unitId: nullableUuid,
  /** Tài khoản duyệt cho các bước kiểu SELECTED: { "1": [userId] } */
  selectedApprovers: z.record(z.array(uuidSchema)).default({}),
});
export type SubmitGeneralRequestInput = z.infer<typeof submitGeneralRequestSchema>;

export const approvalDecisionSchema = z.object({
  comment: optionalText(1000),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export const listApprovalsQuerySchema = paginationSchema.extend({
  box: z.enum(['inbox', 'sent', 'processed']).default('inbox'),
  status: z.enum(Object.keys(APPROVAL_STATUS_LABELS) as [string, ...string[]]).optional(),
});
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;
