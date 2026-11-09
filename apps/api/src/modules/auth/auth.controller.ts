import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginSchema, RegisterSchema, SwitchBusinessSchema } from '@stockwise/shared';
import type { CookieOptions, Request, Response } from 'express';
import { Public, SkipTenant } from '../../common/auth/decorators';
import { RequestContext } from '../../common/context/request-context';
import { AppError } from '../../common/errors/app-error';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { env, isProduction } from '../../config/env';
import { AuthService, type SessionWithRefresh } from './auth.service';

export const REFRESH_COOKIE = 'sw_refresh';
const COOKIE_PATH = '/api/v1/auth';

function cookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: COOKIE_PATH,
    ...(expires ? { expires } : {}),
  };
}

/** Cookie-authenticated routes also check Origin (CSRF, docs/01 §8). */
function assertAllowedOrigin(req: Request): void {
  const origin = req.headers.origin;
  if (origin && !env().WEB_ORIGINS.includes(origin)) {
    throw AppError.forbidden('Origin not allowed');
  }
}

const LOGIN_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly ctx: RequestContext,
  ) {}

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('register')
  async register(
    @Body(new ZodPipe(RegisterSchema)) body: Out<typeof RegisterSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(body));
  }

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginSchema)) body: Out<typeof LoginSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(body));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertAllowedOrigin(req);
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertAllowedOrigin(req);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @SkipTenant()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(this.ctx.userId);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @SkipTenant()
  @Post('switch-business')
  @HttpCode(200)
  async switchBusiness(
    @Body(new ZodPipe(SwitchBusinessSchema)) body: Out<typeof SwitchBusinessSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertAllowedOrigin(req);
    return this.respond(
      res,
      await this.auth.switchBusiness(
        this.ctx.userId,
        body.businessId,
        req.cookies?.[REFRESH_COOKIE],
      ),
    );
  }

  private respond(res: Response, { session, refresh }: SessionWithRefresh) {
    res.cookie(REFRESH_COOKIE, refresh.token, cookieOptions(refresh.expiresAt));
    return session;
  }
}
