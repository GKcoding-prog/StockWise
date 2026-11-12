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

interface StoredToken {
  revokedAt: Date | null;
  replacedById: string | null;
}

/**
 * Rotating refresh tokens (docs/01 §8). Each refresh revokes the presented token and issues a
 * new one in the same family. Presenting an already-revoked token means it was stolen (or
 * replayed): the whole family is revoked.
 *
 * Grace window: a token that was *rotated* (not logged out) less than
 * REFRESH_REUSE_GRACE_SECONDS ago is accepted once more and gets a fresh successor. Without it,
 * two tabs refreshing at the same moment, or a refresh response lost on a flaky mobile
 * connection, would look like theft and log the user out everywhere.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  /** Rotated (not logged out) recently enough to be a benign retry rather than a replay. */
  private withinReuseGrace(token: StoredToken): boolean {
    if (!token.revokedAt || !token.replacedById) return false;
    return Date.now() - token.revokedAt.getTime() < env().REFRESH_REUSE_GRACE_SECONDS * 1000;
  }

  async issue(
    userId: string,
    businessId: string | null,
    familyId: string = randomUUID(),
    id: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const meta = this.ctx.meta;
    const row = await this.prisma.refreshToken.create({
      select: { id: true },
      data: {
        id,
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
    if (current.expiresAt <= new Date()) {
      throw new AppError('UNAUTHENTICATED', 'Refresh token expired');
    }
    const nextBusinessId = businessId ?? current.businessId;

    if (current.revokedAt) {
      return this.retryOrRevoke(current, nextBusinessId);
    }

    // Atomic claim. The successor's id is recorded in the same write, so a concurrent request
    // that loses the race always sees a token that was rotated (eligible for the grace window).
    const successorId = randomUUID();
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: successorId },
    });
    if (claimed.count !== 1) {
      const latest = await this.prisma.refreshToken.findUniqueOrThrow({
        where: { id: current.id },
      });
      return this.retryOrRevoke(latest, nextBusinessId);
    }

    const issued = await this.issue(current.userId, nextBusinessId, current.familyId, successorId);
    return { userId: current.userId, businessId: nextBusinessId, issued };
  }

  /** An already-revoked token: a benign retry inside the grace window, otherwise a replay. */
  private async retryOrRevoke(
    token: StoredToken & { userId: string; familyId: string },
    businessId: string | null,
  ): Promise<{ userId: string; businessId: string | null; issued: IssuedRefreshToken }> {
    if (this.withinReuseGrace(token)) {
      const issued = await this.issue(token.userId, businessId, token.familyId);
      return { userId: token.userId, businessId, issued };
    }
    await this.revokeFamily(token.familyId);
    throw new AppError('REFRESH_TOKEN_REUSED', 'Refresh token was already used');
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
