import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@stockwise/shared';

export const IS_PUBLIC = 'auth:isPublic';
export const SKIP_TENANT = 'auth:skipTenant';
export const REQUIRED_PERMISSIONS = 'auth:permissions';

/** No access token required. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Access token required, but no active membership (e.g. switching business). */
export const SkipTenant = () => SetMetadata(SKIP_TENANT, true);

/** Caller's role must hold every listed permission (docs/03 §2). */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
