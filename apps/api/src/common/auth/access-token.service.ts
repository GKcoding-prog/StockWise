import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { AppError } from '../errors/app-error';

export interface AccessTokenClaims {
  sub: string;
  /** Active business; absent when the user has no membership. */
  bid?: string;
  jti: string;
}

/** Short-lived HS256 access tokens (docs/01 §8). Kept in memory by the SPA. */
@Injectable()
export class AccessTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(userId: string, businessId: string | null): { accessToken: string; expiresIn: number } {
    const expiresIn = env().ACCESS_TOKEN_TTL_SECONDS;
    const claims: AccessTokenClaims = {
      sub: userId,
      jti: randomUUID(),
      ...(businessId ? { bid: businessId } : {}),
    };
    const accessToken = this.jwt.sign(claims, {
      secret: env().JWT_ACCESS_SECRET,
      expiresIn,
      algorithm: 'HS256',
    });
    return { accessToken, expiresIn };
  }

  verify(token: string): AccessTokenClaims {
    try {
      return this.jwt.verify<AccessTokenClaims>(token, {
        secret: env().JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
      });
    } catch (err) {
      if (err instanceof TokenExpiredError)
        throw new AppError('TOKEN_EXPIRED', 'Access token expired');
      throw new AppError('UNAUTHENTICATED', 'Invalid access token');
    }
  }
}
