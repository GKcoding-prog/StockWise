import { Injectable } from '@nestjs/common';
import type { LoginSchema, RegisterSchema } from '@stockwise/shared';
import type { z } from 'zod';
import { AccessTokenService } from '../../common/auth/access-token.service';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { RefreshTokenService, type IssuedRefreshToken } from './refresh-token.service';

export interface Session {
  accessToken: string;
  expiresIn: number;
  activeBusinessId: string | null;
  user: { id: string; email: string; fullName: string; locale: string | null };
  memberships: {
    businessId: string;
    businessName: string;
    role: { key: string; name: string };
  }[];
}

export interface SessionWithRefresh {
  session: Session;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly accessTokens: AccessTokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * UC-01: one transaction creates User → Business → default Warehouse → OWNER membership
   * (docs/02 §7), then logs the new owner in.
   */
  async register(input: z.output<typeof RegisterSchema>): Promise<SessionWithRefresh> {
    this.passwords.assertAcceptable(input.password);
    const passwordHash = await this.passwords.hash(input.password);
    const ownerRole = await this.prisma.role.findFirst({
      where: { businessId: null, key: 'OWNER' },
      select: { id: true },
    });
    if (!ownerRole) throw new Error('System roles are missing: run the database seed');

    let userId: string;
    let businessId: string;
    try {
      ({ userId, businessId } = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            fullName: input.fullName,
            locale: input.locale,
          },
        });
        const business = await tx.business.create({
          data: { name: input.businessName, currency: input.currency, locale: input.locale },
        });
        await tx.warehouse.create({
          data: {
            businessId: business.id,
            name: input.locale === 'fr' ? 'Magasin principal' : 'Main store',
            code: 'MAIN',
            isDefault: true,
          },
        });
        await tx.businessMembership.create({
          data: { businessId: business.id, userId: user.id, roleId: ownerRole.id },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { lastBusinessId: business.id, lastLoginAt: new Date() },
        });
        await this.audit.record(tx, {
          action: 'auth.register',
          entityType: 'Business',
          entityId: business.id,
          businessId: business.id,
          userId: user.id,
          after: { businessName: business.name, currency: business.currency },
        });
        return { userId: user.id, businessId: business.id };
      }));
    } catch (err) {
      if (isUniqueViolation(err, 'email')) {
        throw new AppError('EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw err;
    }
    return this.startSession(userId, businessId);
  }

  async login(input: z.output<typeof LoginSchema>): Promise<SessionWithRefresh> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    if (!user || !ok) {
      await this.audit.record(this.prisma, {
        action: 'auth.login_failed',
        businessId: null,
        userId: user?.id ?? null,
        after: { email: input.email },
      });
      throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    const memberships = await this.activeMemberships(user.id);
    const businessId =
      memberships.find((m) => m.businessId === user.lastBusinessId)?.businessId ??
      memberships[0]?.businessId ??
      null;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(businessId ? { lastBusinessId: businessId } : {}) },
    });
    await this.audit.record(this.prisma, {
      action: 'auth.login',
      businessId,
      userId: user.id,
    });
    return this.startSession(user.id, businessId);
  }

  async refresh(rawRefreshToken: string | undefined): Promise<SessionWithRefresh> {
    if (!rawRefreshToken) throw new AppError('UNAUTHENTICATED', 'Missing refresh token');
    const rotated = await this.refreshTokens.rotate(rawRefreshToken);
    // Drop a business the user no longer actively belongs to.
    const memberships = await this.activeMemberships(rotated.userId);
    const businessId = memberships.some((m) => m.businessId === rotated.businessId)
      ? rotated.businessId
      : (memberships[0]?.businessId ?? null);
    return {
      session: await this.buildSession(rotated.userId, businessId),
      refresh: rotated.issued,
    };
  }

  async switchBusiness(
    userId: string,
    businessId: string,
    rawRefreshToken: string | undefined,
  ): Promise<SessionWithRefresh> {
    const memberships = await this.activeMemberships(userId);
    if (!memberships.some((m) => m.businessId === businessId)) {
      throw AppError.notFound('Business');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { lastBusinessId: businessId } });
    const refresh = rawRefreshToken
      ? (await this.refreshTokens.rotate(rawRefreshToken, businessId)).issued
      : await this.refreshTokens.issue(userId, businessId);
    return { session: await this.buildSession(userId, businessId), refresh };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) await this.refreshTokens.revoke(rawRefreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  async buildSession(userId: string, businessId: string | null): Promise<Session> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const memberships = await this.activeMemberships(userId);
    const { accessToken, expiresIn } = this.accessTokens.sign(userId, businessId);
    return {
      accessToken,
      expiresIn,
      activeBusinessId: businessId,
      user: { id: user.id, email: user.email, fullName: user.fullName, locale: user.locale },
      memberships,
    };
  }

  private async startSession(
    userId: string,
    businessId: string | null,
  ): Promise<SessionWithRefresh> {
    const refresh = await this.refreshTokens.issue(userId, businessId);
    return { session: await this.buildSession(userId, businessId), refresh };
  }

  async activeMemberships(userId: string): Promise<Session['memberships']> {
    const rows = await this.prisma.businessMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        business: { select: { name: true } },
        role: { select: { key: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      businessId: m.businessId,
      businessName: m.business.name,
      role: m.role,
    }));
  }
}
