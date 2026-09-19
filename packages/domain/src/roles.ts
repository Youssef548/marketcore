import { MemberRoles, type MemberRole } from '@app/contracts';

/**
 * Organization administration — adding and removing members.
 *
 * The only role rule with a caller: the `RolesGuard` behind `@OwnerOnly`. There is
 * deliberately no `canReadTenant` counterpart — reading tenant data needs no rule
 * of its own, because reaching a tenant at all already required a membership row,
 * so such a function would have had no caller and would have restated the guard.
 */
export function canManageMembership(role: MemberRole): boolean {
  return role === MemberRoles.OWNER;
}
