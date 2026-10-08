import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  COOKIE_NAMES,
  CRELINK_LIMITS,
  GoogleAuthCallbackResponse,
  GoogleAuthStartResponse,
  MeResponse,
  SessionUser,
} from '@crelink/shared';
import type { Request, Response } from 'express';
import { AppConfig } from '../config.service';
import { readCookie, serializeCookie } from '../common/http';
import { countBusinessMetric } from '../monitoring/metrics';
import { AuthService } from './auth.service';
import { CurrentUser, SessionGuard } from './session.guard';

const OAUTH_STATE_SECONDS = 10 * 60;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  /** 웹 `GET /auth/google`이 서버에서 호출하고 Set-Cookie를 브라우저에 그대로 전달합니다. */
  @Get('google/start')
  start(@Res({ passthrough: true }) response: Response): GoogleAuthStartResponse {
    const { authorizationUrl, state } = this.auth.start();
    response.setHeader(
      'Set-Cookie',
      serializeCookie(COOKIE_NAMES.oauthState, state, OAUTH_STATE_SECONDS, this.config.webCookieSecure),
    );
    response.setHeader('Cache-Control', 'no-store');
    return { authorizationUrl };
  }

  @Post('google/callback')
  @HttpCode(200)
  async callback(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GoogleAuthCallbackResponse> {
    const secure = this.config.webCookieSecure;
    // state는 한 번만 씁니다. 성공·실패와 관계없이 지웁니다.
    response.setHeader('Set-Cookie', serializeCookie(COOKIE_NAMES.oauthState, '', 0, secure));
    const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    let session: { user: SessionUser; token: string };
    try {
      session = await this.auth.completeLogin(input.code, input.state, readCookie(request, COOKIE_NAMES.oauthState));
    } catch (error) {
      // 업무 지표: state·code 오류, 구글 검증 실패, 정지 계정, 로그인 설정 없음, 예상 못 한 오류 모두 실패 1회입니다.
      countBusinessMetric('crelink.auth.login', { result: 'failure' });
      throw error;
    }
    countBusinessMetric('crelink.auth.login', { result: 'success' });
    const { user, token } = session;
    response.setHeader('Set-Cookie', [
      serializeCookie(COOKIE_NAMES.session, token, CRELINK_LIMITS.sessionDays * 24 * 60 * 60, secure),
      serializeCookie(COOKIE_NAMES.oauthState, '', 0, secure),
    ]);
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(readCookie(request, COOKIE_NAMES.session));
    response.setHeader('Set-Cookie', serializeCookie(COOKIE_NAMES.session, '', 0, this.config.webCookieSecure));
  }
}

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  me(@CurrentUser() user: SessionUser): MeResponse {
    return user;
  }
}
