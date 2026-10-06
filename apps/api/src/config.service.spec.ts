import {
  assertProductionConfig,
  parseDatabasePoolMax,
  parseFileStorageConfig,
  parseTrustedProxyHops,
  productionConfigProblems,
} from './config.service';

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

  it('FILE_STORAGE=s3면 UPLOAD_DIR 대신 S3 키가 필수이고 S3_ENDPOINT도 https여야 한다', () => {
    const s3 = {
      ...PRODUCTION,
      UPLOAD_DIR: undefined,
      FILE_STORAGE: 's3',
      S3_ENDPOINT: 'https://s3.example',
      S3_BUCKET: 'crelink-uploads',
      S3_ACCESS_KEY_ID: 'access-id',
      S3_SECRET_ACCESS_KEY: 's3-secret',
    };
    expect(productionConfigProblems(s3)).toEqual([]);
    expect(
      productionConfigProblems({ ...s3, S3_BUCKET: ' ', S3_SECRET_ACCESS_KEY: '', S3_ENDPOINT: 'http://s3.example' }),
    ).toEqual(['비어 있음: S3_BUCKET, S3_SECRET_ACCESS_KEY', 'https URL이 아님: S3_ENDPOINT']);
    expect(productionConfigProblems({ ...s3, FILE_STORAGE: 'disk' })).toEqual(['비어 있음: UPLOAD_DIR']);
  });

  it('FILE_STORAGE가 disk·s3가 아니면 거부한다', () => {
    expect(productionConfigProblems({ ...PRODUCTION, FILE_STORAGE: 'S3' })).toEqual([
      'FILE_STORAGE가 disk·s3 중 하나가 아님',
    ]);
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

describe('DATABASE_POOL_MAX', () => {
  it('비면 15, 1 이상의 정수를 그대로 쓴다', () => {
    expect(parseDatabasePoolMax(undefined)).toBe(15);
    expect(parseDatabasePoolMax(' ')).toBe(15);
    expect(parseDatabasePoolMax('6')).toBe(6);
    expect(parseDatabasePoolMax(' 1 ')).toBe(1);
  });

  it('정수가 아니거나 1 미만이면 값 없이 키 이름만 넣은 오류로 기동을 거부한다', () => {
    for (const value of ['0', '-1', '1.5', 'six', '1e2', '6 connections', '99999999999999999999']) {
      expect(() => parseDatabasePoolMax(value)).toThrow(
        new Error('DATABASE_POOL_MAX는 1 이상의 정수여야 합니다(기본 15).'),
      );
    }
  });
});

describe('파일 저장소 설정(FILE_STORAGE·S3_*)', () => {
  const S3 = {
    FILE_STORAGE: 's3',
    S3_ENDPOINT: 'https://s3.example/',
    S3_BUCKET: 'crelink-uploads',
    S3_ACCESS_KEY_ID: 'access-id',
    S3_SECRET_ACCESS_KEY: 's3-secret',
  };

  it('비거나 disk면 로컬 디스크다(S3 키는 보지 않음)', () => {
    expect(parseFileStorageConfig({})).toEqual({ kind: 'disk' });
    expect(parseFileStorageConfig({ FILE_STORAGE: ' disk ', S3_ENDPOINT: 'not a url' })).toEqual({ kind: 'disk' });
  });

  it('s3면 엔드포인트 끝 /를 빼고 지역은 비면 us-east-1이다', () => {
    expect(parseFileStorageConfig(S3)).toEqual({
      kind: 's3',
      endpoint: 'https://s3.example',
      region: 'us-east-1',
      bucket: 'crelink-uploads',
      accessKeyId: 'access-id',
      secretAccessKey: 's3-secret',
    });
    expect(parseFileStorageConfig({ ...S3, S3_REGION: 'auto' })).toMatchObject({ region: 'auto' });
  });

  it('알 수 없는 종류, 빠진 S3 키, http(s)가 아닌 엔드포인트는 키 이름만 담아 거부한다', () => {
    expect(() => parseFileStorageConfig({ FILE_STORAGE: 'gcs' })).toThrow('FILE_STORAGE는 disk 또는 s3');
    expect(() => parseFileStorageConfig({ ...S3, S3_BUCKET: '', S3_ACCESS_KEY_ID: ' ' })).toThrow(
      'FILE_STORAGE=s3에는 S3_BUCKET, S3_ACCESS_KEY_ID가 필요합니다.',
    );
    for (const endpoint of ['s3.example', 'ftp://s3.example']) {
      let message = '';
      try {
        parseFileStorageConfig({ ...S3, S3_ENDPOINT: endpoint });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('S3_ENDPOINT는 http(s) URL');
      expect(message).not.toContain('s3-secret');
    }
  });
});
