import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Tracks by IP, plus the submitted email on auth routes, so the stricter login limit
 * (5/min per IP + email, docs/01 §8) can't be spread across accounts or exhausted for others.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    const email =
      typeof r.body === 'object' && r.body && typeof r.body.email === 'string'
        ? r.body.email.trim().toLowerCase()
        : '';
    return email && r.path.includes('/auth/') ? `${r.ip}:${email}` : (r.ip ?? 'unknown');
  }
}
