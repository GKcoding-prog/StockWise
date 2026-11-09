import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import {
  ChangePasswordSchema,
  PLAN_FEATURES,
  UpdateMeSchema,
  type PermissionKey,
} from '@stockwise/shared';
import type { Request } from 'express';
import { SkipTenant } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { AppError } from '../../common/errors/app-error';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { REFRESH_COOKIE } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';

@Controller('me')
@SkipTenant()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  /** User + active business + role + permissions + plan features. Drives the whole UI. */
  @Get()
  async me() {
    const userId = this.ctx.userId;
    const businessId = this.ctx.tokenBusinessId;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        locale: true,
        lastLoginAt: true,
      },
    });
    const membership = businessId
      ? await this.prisma.businessMembership.findUnique({
          where: { businessId_userId: { businessId, userId } },
          include: {
            business: {
              select: {
                id: true,
                name: true,
                currency: true,
                locale: true,
                timezone: true,
                plan: true,
              },
            },
            role: { include: { permissions: { select: { permissionKey: true } } } },
          },
        })
      : null;
    const active = membership?.status === 'ACTIVE' ? membership : null;
    return {
      user,
      business: active?.business ?? null,
      role: active ? { id: active.role.id, key: active.role.key, name: active.role.name } : null,
      permissions: (active?.role.permissions.map((p) => p.permissionKey) ?? []) as PermissionKey[],
      features: active ? PLAN_FEATURES[active.business.plan] : [],
      memberships: await this.auth.activeMemberships(userId),
    };
  }

  @Patch()
  async update(@Body(new ZodPipe(UpdateMeSchema)) body: Out<typeof UpdateMeSchema>) {
    const user = await this.prisma.user.update({
      where: { id: this.ctx.userId },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
      },
      select: { id: true, email: true, fullName: true, phone: true, locale: true },
    });
    return user;
  }

  /** Revokes the user's other sessions (docs/05 §4.2). */
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @Body(new ZodPipe(ChangePasswordSchema)) body: Out<typeof ChangePasswordSchema>,
    @Req() req: Request,
  ) {
    const userId = this.ctx.userId;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, body.currentPassword))) {
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    this.passwords.assertAcceptable(body.newPassword);
    const passwordHash = await this.passwords.hash(body.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.audit.record(tx, {
        action: 'auth.change_password',
        entityType: 'User',
        entityId: userId,
        userId,
        businessId: this.ctx.tokenBusinessId ?? null,
      });
    });
    await this.refreshTokens.revokeAllForUser(userId, req.cookies?.[REFRESH_COOKIE]);
  }

  @Get('memberships')
  async memberships() {
    return { data: await this.auth.activeMemberships(this.ctx.userId) };
  }
}
