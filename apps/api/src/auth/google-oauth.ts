import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** ID 토큰 검증을 마친 구글 계정 정보. */
export interface GoogleProfile {
  subject: string;
  email: string;
  emailVerified: boolean;
}

/**
 * 구글 OAuth 경계. 통합 테스트는 이 provider만 교체해 실제 구글 호출 없이 가입·로그인 흐름을 검증합니다.
 */
export abstract class GoogleOAuth {
  abstract authorizationUrl(config: GoogleClientConfig, state: string): string;
  /** authorization code를 토큰으로 바꾸고 ID 토큰 서명·aud·만료를 검증합니다. 실패하면 예외. */
  abstract verifyCode(config: GoogleClientConfig, code: string): Promise<GoogleProfile>;
}

@Injectable()
export class GoogleAuthLibraryOAuth extends GoogleOAuth {
  authorizationUrl(config: GoogleClientConfig, state: string): string {
    return new OAuth2Client(config).generateAuthUrl({
      scope: ['openid', 'email'],
      state,
      prompt: 'select_account',
    });
  }

  async verifyCode(config: GoogleClientConfig, code: string): Promise<GoogleProfile> {
    const client = new OAuth2Client(config);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error('구글 토큰 응답에 id_token이 없습니다.');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new Error('ID 토큰에 sub 또는 email이 없습니다.');
    return { subject: payload.sub, email: payload.email, emailVerified: payload.email_verified === true };
  }
}
