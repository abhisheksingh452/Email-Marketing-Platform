import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { CurrentPrincipal, Public } from '../../common/decorators';
import { AuthedRequest, Principal, getRequestMeta } from '../../common/types/request';
import type { Env } from '../../config/env';
import { SESSION_COOKIE } from './auth.constants';
import { AuthService, principalToView } from './auth.service';
import { ForgotPasswordDto, LoginDto, ResetPasswordDto } from './dto/auth.dto';
import type { CreatedSession } from './session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }

  private setSessionCookie(res: Response, session: CreatedSession) {
    res.cookie(SESSION_COOKIE, session.token, { ...this.cookieOptions(), expires: session.expiresAt });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const { session, user } = await this.auth.login(dto, getRequestMeta(req));
    this.setSessionCookie(res, session);
    return user;
  }

  @HttpCode(200)
  @Post('logout')
  async logout(
    @CurrentPrincipal() principal: Principal,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(principal, getRequestMeta(req));
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    return { success: true };
  }

  /** Rotates the session token and extends expiry. Call it periodically from the web app. */
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.refresh(principal, getRequestMeta(req));
    this.setSessionCookie(res, session);
    return { expiresAt: session.expiresAt };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: AuthedRequest) {
    return this.auth.forgotPassword(dto, getRequestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: AuthedRequest) {
    return this.auth.resetPassword(dto, getRequestMeta(req));
  }
}

@ApiTags('auth')
@Controller('me')
export class MeController {
  @Get()
  me(@CurrentPrincipal() principal: Principal) {
    return principalToView(principal);
  }
}
