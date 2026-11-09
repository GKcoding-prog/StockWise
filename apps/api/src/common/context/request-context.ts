import { Injectable } from '@nestjs/common';
import type { BusinessSettings, PermissionKey, Plan, SystemRoleKey } from '@stockwise/shared';
import { ClsService, type ClsStore } from 'nestjs-cls';
import { AppError } from '../errors/app-error';

/** The caller's tenant, loaded from the verified token + an ACTIVE membership (docs/01 §6). */
export interface TenantCtx {
  userId: string;
  businessId: string;
  membershipId: string;
  roleKey: SystemRoleKey | string;
  permissions: ReadonlySet<PermissionKey>;
  plan: Plan;
  settings: BusinessSettings;
  currency: string;
  timezone: string;
}

export interface AppClsStore extends ClsStore {
  requestId: string;
  ip?: string;
  userAgent?: string;
  /** Set by JwtAuthGuard. */
  userId?: string;
  /** `bid` claim from the access token; may be absent for users with no business. */
  tokenBusinessId?: string;
  /** Set by TenantGuard. */
  tenant?: TenantCtx;
}

@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  /** The current tenant. Throws if called on a route that skipped the TenantGuard. */
  get tenant(): TenantCtx {
    const tenant = this.cls.isActive() ? this.cls.get('tenant') : undefined;
    if (!tenant) throw new AppError('UNAUTHENTICATED', 'No tenant context for this request');
    return tenant;
  }

  get userId(): string {
    const userId = this.cls.isActive() ? this.cls.get('userId') : undefined;
    if (!userId) throw new AppError('UNAUTHENTICATED');
    return userId;
  }

  get tokenBusinessId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('tokenBusinessId') : undefined;
  }

  can(permission: PermissionKey): boolean {
    return this.tenant.permissions.has(permission);
  }

  get meta(): { requestId?: string; ip?: string; userAgent?: string } {
    if (!this.cls.isActive()) return {};
    return {
      requestId: this.cls.get('requestId'),
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
    };
  }
}
