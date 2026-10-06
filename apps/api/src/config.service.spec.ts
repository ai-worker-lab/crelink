import { assertProductionConfig, parseTrustedProxyHops, productionConfigProblems } from './config.service';

const PRODUCTION = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://crelink:db-secret@db.example:5432/postgres',
  PORT: '3000',
  WEB_URL: 'https://links.example',
  SHORT_LINK_BASE_URL: 'https://go.example',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  OPERATOR_EMAILS: 'operator@example.com',
  UPLOAD_DIR: '/data/uploads',
};

describe('운영 설정 검증', () => {
  it('NODE_ENV=production이 아니면 비어 있어도 문제가 없다(로컬·테스트)', () => {
    expect(productionConfigProblems({})).toEqual([]);
    expect(productionConfigProblems({ NODE_ENV: 'development', WEB_URL: 'http://127.0.0.1:5193' })).toEqual([]);
  });

  it('필수 키가 모두 있고 https면 통과한다', () => {
    expect(productionConfigProblems(PRODUCTION)).toEqual([]);
    expect(() => assertProductionConfig(PRODUCTION)).not.toThrow();
  });

  it('비거나 공백인 키, 운영자 이메일이 하나도 없는 값, https가 아닌 주소를 한 번에 모은다', () => {
    const problems = productionConfigProblems({
      ...PRODUCTION,
      DATABASE_URL: undefined,
      GOOGLE_CLIENT_SECRET: '   ',
      OPERATOR_EMAILS: ' , ',
      UPLOAD_DIR: '',
      WEB_URL: 'http://links.example',
      SHORT_LINK_BASE_URL: 'not a url',
    });
    expect(problems).toEqual([
      '비어 있음: DATABASE_URL, GOOGLE_CLIENT_SECRET, OPERATOR_EMAILS, UPLOAD_DIR',
      'https URL이 아님: WEB_URL, SHORT_LINK_BASE_URL',
    ]);
  });

  it('오류 메시지에는 키 이름만 있고 비밀값은 없다', () => {
    let message = '';
    try {
      assertProductionConfig({ ...PRODUCTION, GOOGLE_CLIENT_ID: '', WEB_URL: 'http://links.example' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('GOOGLE_CLIENT_ID');
    expect(message).toContain('WEB_URL');
    for (const secret of ['db-secret', 'google-secret', 'operator@example.com', 'http://links.example']) {
      expect(message).not.toContain(secret);
    }
  });
});

describe('TRUSTED_PROXY_HOPS', () => {
  it('비면 0, 0 이상의 정수만 받는다', () => {
    expect(parseTrustedProxyHops(undefined)).toBe(0);
    expect(parseTrustedProxyHops(' ')).toBe(0);
    expect(parseTrustedProxyHops('1')).toBe(1);
    for (const value of ['-1', '1.5', 'one', '1e2']) {
      expect(() => parseTrustedProxyHops(value)).toThrow('TRUSTED_PROXY_HOPS');
    }
  });
});
