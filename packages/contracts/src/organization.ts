import { z } from 'zod';
import {
  MemberRoles,
  OrganizationStatuses,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
  wireValues,
} from './constants';

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().min(1),
  // Optional: a caller that supplies only a name gets one derived from it. Omitted
  // rather than required-empty so the intent is explicit, and validated by the same
  // pattern either way.
  slug: z
    .string()
    .min(SLUG_MIN_LENGTH)
    .max(SLUG_MAX_LENGTH)
    .regex(SLUG_PATTERN)
    .optional(),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(wireValues(OrganizationStatuses)),
  role: z.enum(wireValues(MemberRoles)),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const AddMemberRequestSchema = z.object({ email: z.email() });
export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

export const OrganizationMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.enum(wireValues(MemberRoles)),
});
export type OrganizationMember = z.infer<typeof OrganizationMemberSchema>;
