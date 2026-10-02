import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DivisionAccessService } from '../../permission/services/division-access.service';
import { REQUIRE_PERMISSION_KEY } from './permission.guard';
import { REQUIRE_ORG_SCOPE_KEY } from './org-scope.guard';
import { isUnrestricted, DivisionAccess } from '../../../common/division-scope.util';

export const REQUIRE_DIVISION_SCOPE_KEY = 'require_division_scope';

/**
 * Marks a route as division-sensitive. The guard still runs when only
 * `@UseGuards(DivisionScopeGuard)` is present; the decorator makes the intent
 * explicit in the handler signature and lets the guard be strict there.
 */
export const RequireDivisionScope = () => SetMetadata(REQUIRE_DIVISION_SCOPE_KEY, true);

/** Body/query/route keys that may carry an explicit division reference. */
const DIVISION_KEYS = ['divisionId', 'division_id'];

/**
 * Layer 4 of the defence-in-depth model (Prompt #16 §15 / §31).
 *
 * Responsibilities:
 *  1. Resolve `effectiveDivisions = userScope ∩ roleScope` for the permission
 *     on this handler and publish it as `request.allowedDivisionIds`.
 *  2. Reject an EXPLICIT division reference (`?divisionId=…`, body or route
 *     param) that is outside that set with 403.
 *  3. When no division is specified, leave `request.allowedDivisionIds` on the
 *     request so services filter the query to exactly those divisions.
 *
 * This guard never *grants* anything — `PermissionGuard` still decides whether
 * the permission itself is allowed, and `OrgScopeGuard` still validates the
 * organizational scope. If `request.allowedDivisionIds` is `'ALL'` the request
 * behaves exactly as it did before Prompt #16.
 */
@Injectable()
export class DivisionScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly divisionAccessService: DivisionAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const permissionCode = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requireOrgScope = this.reflector.getAllAndOverride<boolean>(REQUIRE_ORG_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? false;

    // Enforcement master switch (§32). When off, still publish the resolved
    // access so code paths keep working, but do not reject anything.
    const enforcing = this.divisionAccessService.isEnforcementEnabled();

    const access = await this.divisionAccessService.resolveForRequest(request, permissionCode);
    request.allowedDivisionIds = access;

    if (!enforcing) return true;

    // Empty intersection ⇒ no effective access at all (§11).
    if (Array.isArray(access) && access.length === 0) {
      throw new ForbiddenException('You do not have access to any division for this action.');
    }

    const explicitDivisionId = this.findExplicitDivisionId(request);
    if (!explicitDivisionId) {
      // No division requested — services must filter to `allowedDivisionIds`.
      return true;
    }

    if (this.divisionAccessService.isDivisionAllowed(access, explicitDivisionId)) {
      return true;
    }

    // `requireOrgScope` is read only to keep the message consistent with the
    // existing guard family; it does not relax the check.
    void requireOrgScope;
    throw new ForbiddenException('You do not have access to this division.');
  }

  /** Explicit division reference from query → body → route params. */
  private findExplicitDivisionId(request: any): string | undefined {
    for (const key of DIVISION_KEYS) {
      const source = [request.query, request.body, request.params];
      for (const bucket of source) {
        if (!bucket || typeof bucket !== 'object') continue;
        const raw = bucket[key];
        if (typeof raw === 'string') {
          const val = raw.trim();
          const lower = val.toLowerCase();
          if (
            val !== '' &&
            lower !== 'null' &&
            lower !== 'undefined' &&
            lower !== '__all__' &&
            lower !== 'all' &&
            lower !== 'none'
          ) {
            return val;
          }
        }
      }
    }
    return undefined;
  }
}

/**
 * Helper shared by controllers: the `string[]` a service should filter with,
 * or `undefined` when the caller is unrestricted (legacy behaviour).
 *
 * Returns an empty array only for a genuine empty intersection, which
 * `applyDivisionScopeFilter` turns into `1 = 0` rather than `IN ()`.
 */
export function divisionFilterFromRequest(
  access: DivisionAccess | string[] | null | undefined,
): string[] | undefined {
  if (isUnrestricted(access)) return undefined;
  return access as string[];
}
