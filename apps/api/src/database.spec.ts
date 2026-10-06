import { databaseConnectionConfig } from './database';

const URL_WITH_SSL = 'postgresql://user:p%40ss@pooler.example:5432/postgres?sslmode=require&application_name=x';
const CA = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

describe('databaseConnectionConfig (DATABASE_SSL)', () => {
  it('DATABASE_SSL이 비면 URL을 그대로 넘기고 ssl을 정하지 않는다(기존 동작)', () => {
    expect(databaseConnectionConfig({ DATABASE_URL: URL_WITH_SSL })).toEqual({ connectionString: URL_WITH_SSL });
  });

  it('DATABASE_SSL이 있으면 URL의 TLS 파라미터를 지우고 환경변수 값을 따른다', () => {
    const stripped = 'postgresql://user:p%40ss@pooler.example:5432/postgres?application_name=x';
    expect(databaseConnectionConfig({ DATABASE_URL: URL_WITH_SSL, DATABASE_SSL: 'disable' })).toEqual({
      connectionString: stripped,
      ssl: false,
    });
    expect(databaseConnectionConfig({ DATABASE_URL: URL_WITH_SSL, DATABASE_SSL: 'require' })).toEqual({
      connectionString: stripped,
      ssl: { rejectUnauthorized: false },
    });
    const plain = 'postgresql://user:pw@127.0.0.1:5432/crelink';
    expect(databaseConnectionConfig({ DATABASE_URL: plain, DATABASE_SSL: 'verify-full' })).toEqual({
      connectionString: plain,
      ssl: { rejectUnauthorized: true },
    });
  });

  it('verify-full과 CA 경로면 CA 파일을 ssl.ca로 쓴다', () => {
    const read = jest.fn(() => CA);
    expect(
      databaseConnectionConfig(
        { DATABASE_URL: URL_WITH_SSL, DATABASE_SSL: 'verify-full', DATABASE_SSL_CA_PATH: '/run/ca.crt' },
        read,
      ),
    ).toEqual({
      connectionString: 'postgresql://user:p%40ss@pooler.example:5432/postgres?application_name=x',
      ssl: { rejectUnauthorized: true, ca: CA },
    });
    expect(read).toHaveBeenCalledWith('/run/ca.crt');
  });

  it('잘못된 값은 기동을 거부한다', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@h:5432/d' };
    expect(() => databaseConnectionConfig({ ...base, DATABASE_SSL: 'prefer' })).toThrow('DATABASE_SSL은');
    expect(() => databaseConnectionConfig({ ...base, DATABASE_SSL: 'require', DATABASE_SSL_CA_PATH: '/ca' })).toThrow(
      'verify-full일 때만',
    );
    expect(() => databaseConnectionConfig({ ...base, DATABASE_SSL_CA_PATH: '/ca' })).toThrow('verify-full일 때만');
    const missing = () => {
      throw new Error('ENOENT');
    };
    expect(() =>
      databaseConnectionConfig({ ...base, DATABASE_SSL: 'verify-full', DATABASE_SSL_CA_PATH: '/missing' }, missing),
    ).toThrow('DATABASE_SSL_CA_PATH(/missing)를 읽지 못했습니다: ENOENT');
    expect(() =>
      databaseConnectionConfig({ ...base, DATABASE_SSL: 'verify-full', DATABASE_SSL_CA_PATH: '/ca' }, () => 'nope'),
    ).toThrow('PEM 인증서가 아닙니다');
  });

  it('해석할 수 없는 DATABASE_URL 오류에 URL 값(비밀번호)을 넣지 않는다', () => {
    expect(() =>
      databaseConnectionConfig({ DATABASE_URL: 'not a url?password=secret', DATABASE_SSL: 'require' }),
    ).toThrow(/^DATABASE_URL을 URL로 해석할 수 없습니다\.$/);
  });
});
