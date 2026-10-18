import { z } from 'zod';
import { POLICY_PARAMETER_CODES } from '../constants/policy-parameters';
import { dateOnlySchema, decimalSchema, optionalText } from './common';

export const createParameterVersionSchema = z.object({
  code: z.enum(POLICY_PARAMETER_CODES as [string, ...string[]]),
  effectiveFrom: dateOnlySchema,
  value: decimalSchema,
  legalBasis: optionalText(500),
  note: optionalText(1000),
});
export type CreateParameterVersionInput = z.infer<typeof createParameterVersionSchema>;
