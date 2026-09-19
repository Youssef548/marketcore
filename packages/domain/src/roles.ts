import { MemberRoles, type MemberRole } from '@app/contracts';

/** Organization administration — adding and removing members. */
export function canManageMembership(role: MemberRole): boolean {
  return role === MemberRoles.OWNER;
}

/** Reading tenant data. Named rather than inlined so adding a role is one change. */
export function canReadTenant(role: MemberRole): boolean {
  return role === MemberRoles.OWNER || role === MemberRoles.MEMBER;
}
