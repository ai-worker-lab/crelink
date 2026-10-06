import { GoogleAuthLibraryOAuth } from './google-oauth';

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
