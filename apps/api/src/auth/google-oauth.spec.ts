import { GoogleAuthLibraryOAuth, googleVerifyFailureReason } from './google-oauth';

describe('GoogleAuthLibraryOAuth', () => {
  it('인증 주소에 client_id·redirect_uri·state·openid email 범위를 담는다', () => {
    const url = new URL(
      new GoogleAuthLibraryOAuth().authorizationUrl(
        { clientId: 'client-1', clientSecret: 'secret', redirectUri: 'http://127.0.0.1:5193/auth/google/callback' },
        'state-123',
      ),
    );
    expect(url.origin).toBe('https://accounts.google.com');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-1',
      redirect_uri: 'http://127.0.0.1:5193/auth/google/callback',
      response_type: 'code',
      scope: 'openid email',
      state: 'state-123',
    });
  });
});

describe('googleVerifyFailureReason', () => {
  it('검증 실패 문구에서 ID 토큰 payload·원문 꼬리를 버리고 오류 이름과 이유는 남긴다', () => {
    const payload = JSON.stringify({
      sub: '1234567890',
      email: 'creator@example.com',
      name: '홍길동',
      picture: 'https://p',
    });
    const late = googleVerifyFailureReason(new Error(`Token used too late, 1700000000 > 1690000000: ${payload}`));
    expect(late).toBe('Error: Token used too late, 1700000000 > 1690000000');
    const signature = googleVerifyFailureReason(
      new Error('Invalid token signature: eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln'),
    );
    expect(signature).toBe('Error: Invalid token signature');
    expect(googleVerifyFailureReason(new Error('Wrong recipient, payload audience != requiredAudience'))).toBe(
      'Error: Wrong recipient, payload audience != requiredAudience',
    );
  });
});
