import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { RequestContext } from '../../common/context/request-context';
import { randomToken, sha256 } from '../../common/crypto';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';

export interface IssuedRefreshToken {
  id: string;
  token: string;
  expiresAt: Date;
}

/**
 * Rotating refresh tokens (docs/01 §8). Each refresh revokes the presented token and issues a
 * new one in the same family. Presenting an already-revoked token means it was stolen (or
 * replayed): the whole family is revoked.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  async issue(
    userId: string,
    businessId: string | null,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const meta = this.ctx.meta;
    const row = await this.prisma.refreshToken.create({
      select: { id: true },
      data: {
        userId,
        businessId,
        familyId,
        tokenHash: sha256(token),
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip?.slice(0, 64),
      },
    });
    return { id: row.id, token, expiresAt };
  }

  /** Revokes `raw` and issues its successor. `businessId` overrides the session's business. */
  async rotate(
    raw: string,
    businessId?: string,
  ): Promise<{ userId: string; businessId: string | null; issued: IssuedRefreshToken }> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(raw) },
    });
    if (!current) throw new AppError('UNAUTHENTICATED', 'Unknown refresh token');
    if (current.revokedAt) {
      await this.revokeFamily(current.familyId);
      throw new AppError('REFRESH_TOKEN_REUSED', 'Refresh token was already used');
    }
    if (current.expiresAt <= new Date()) {
      throw new AppError('UNAUTHENTICATED', 'Refresh token expired');
    }

    // Atomic claim: if a concurrent request rotated it first, treat this one as reuse.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(current.familyId);
      throw new AppError('REFRESH_TOKEN_REUSED', 'Refresh token was already used');
    }

    const nextBusinessId = businessId ?? current.businessId;
    const issued = await this.issue(current.userId, nextBusinessId, current.familyId);
    await this.prisma.refreshToken.update({
      where: { id: current.id },
      data: { replacedById: issued.id },
    });
    return { userId: current.userId, businessId: nextBusinessId, issued };
  }

  async revoke(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, exceptRaw?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptRaw ? { tokenHash: { not: sha256(exceptRaw) } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
