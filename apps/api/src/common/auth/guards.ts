import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseBusinessSettings, type PermissionKey } from '@stockwise/shared';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import type { AppClsStore } from '../context/request-context';
import { AppError } from '../errors/app-error';
import { AccessTokenService } from './access-token.service';
import { IS_PUBLIC, REQUIRED_PERMISSIONS, SKIP_TENANT } from './decorators';

function flag(reflector: Reflector, key: string, ctx: ExecutionContext): boolean {
  return reflector.getAllAndOverride<boolean>(key, [ctx.getHandler(), ctx.getClass()]) === true;
}

/** Verifies the Bearer access token: sub = userId, bid = businessId. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (flag(this.reflector, IS_PUBLIC, ctx)) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new AppError('UNAUTHENTICATED', 'Missing access token');
    const claims = this.tokens.verify(header.slice('Bearer '.length).trim());
    this.cls.set('userId', claims.sub);
    this.cls.set('tokenBusinessId', claims.bid);
    return true;
  }
}

/**
 * Loads the ACTIVE membership for (userId, bid) on every request, so role changes and
 * suspensions take effect immediately (docs/01 §6).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (flag(this.reflector, IS_PUBLIC, ctx) || flag(this.reflector, SKIP_TENANT, ctx)) return true;
    const userId = this.cls.get('userId');
    const businessId = this.cls.get('tokenBusinessId');
    if (!userId) throw new AppError('UNAUTHENTICATED');
    if (!businessId) throw AppError.forbidden('No active business');

    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId_userId: { businessId, userId } },
      include: {
        role: { include: { permissions: { select: { permissionKey: true } } } },
        business: { select: { plan: true, settings: true, currency: true, timezone: true } },
      },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw AppError.forbidden('Membership is not active');
    }

    this.cls.set('tenant', {
      userId,
      businessId,
      membershipId: membership.id,
      roleKey: membership.role.key,
      permissions: new Set(
        membership.role.permissions.map((p) => p.permissionKey as PermissionKey),
      ),
      plan: membership.business.plan,
      settings: parseBusinessSettings(membership.business.settings),
      currency: membership.business.currency,
      timezone: membership.business.timezone,
    });
    return true;
  }
}

/** Enforces @RequirePermissions(...). The backend check is the one that matters (docs/01 §9). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      REQUIRED_PERMISSIONS,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required?.length) return true;
    const tenant = this.cls.get('tenant');
    if (!tenant) throw AppError.forbidden();
    const missing = required.filter((p) => !tenant.permissions.has(p));
    if (missing.length) throw new AppError('FORBIDDEN', 'Missing permission', { missing });
    return true;
  }
}
