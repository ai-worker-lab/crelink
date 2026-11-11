import {
  AppConfig,
  assertProductionConfig,
  INSTAGRAM_REQUIRED_KEYS,
  parseBannerSlotLimits,
  parseDatabasePoolMax,
  parseFileStorageConfig,
  parseInstagramSettings,
  parseTrustedProxyHops,
  productionConfigProblems,
  PRODUCTION_REQUIRED_KEYS,
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

describe('BANNER_SLOT_MAX·BANNER_SLOT_TOTAL_MAX', () => {
  it('비면 5·20, 정수 값은 앞뒤 공백을 빼고 그대로 쓴다', () => {
    expect(parseBannerSlotLimits({})).toEqual({ visibleMax: 5, totalMax: 20 });
    expect(parseBannerSlotLimits({ BANNER_SLOT_MAX: ' ', BANNER_SLOT_TOTAL_MAX: '' })).toEqual({
      visibleMax: 5,
      totalMax: 20,
    });
    expect(parseBannerSlotLimits({ BANNER_SLOT_MAX: ' 3 ', BANNER_SLOT_TOTAL_MAX: '8' })).toEqual({
      visibleMax: 3,
      totalMax: 8,
    });
  });

  it('보관 상한은 보이는 배너 상한과 같아도 된다', () => {
    expect(parseBannerSlotLimits({ BANNER_SLOT_MAX: '7', BANNER_SLOT_TOTAL_MAX: '7' })).toEqual({
      visibleMax: 7,
      totalMax: 7,
    });
    expect(parseBannerSlotLimits({ BANNER_SLOT_MAX: '20' })).toEqual({ visibleMax: 20, totalMax: 20 });
  });

  it('BANNER_SLOT_MAX가 1 이상의 정수가 아니면 값 없이 키 이름만 넣은 오류로 기동을 거부한다', () => {
    for (const value of ['0', '-1', '1.5', 'five', '1e2', '99999999999999999999']) {
      expect(() => parseBannerSlotLimits({ BANNER_SLOT_MAX: value })).toThrow(
        new Error('BANNER_SLOT_MAX는 1 이상의 정수여야 합니다(기본 5).'),
      );
    }
  });

  it('BANNER_SLOT_TOTAL_MAX가 정수가 아니거나 BANNER_SLOT_MAX보다 작으면 기동을 거부한다', () => {
    const error = new Error('BANNER_SLOT_TOTAL_MAX는 BANNER_SLOT_MAX 이상의 정수여야 합니다(기본 20).');
    for (const value of ['0', '-1', '2.5', 'twenty', '4']) {
      expect(() => parseBannerSlotLimits({ BANNER_SLOT_MAX: '5', BANNER_SLOT_TOTAL_MAX: value })).toThrow(error);
    }
    // 보이는 상한만 기본 보관 상한(20)보다 크게 올리면 보관 상한도 함께 올려야 합니다.
    expect(() => parseBannerSlotLimits({ BANNER_SLOT_MAX: '21' })).toThrow(error);
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

describe('Instagram DM 설정(META_*·INSTAGRAM_*)', () => {
  const b64 = (fill: number) => Buffer.alloc(32, fill).toString('base64');
  const INSTAGRAM = {
    META_APP_ID: 'app-id',
    META_APP_SECRET: 'meta-app-secret-value',
    META_LOGIN_CONFIG_ID: 'config-id',
    META_WEBHOOK_VERIFY_TOKEN: 'verify-token-value',
    INSTAGRAM_TOKEN_KEYS: `1:${b64(1)},2:${b64(2)}`,
    INSTAGRAM_TOKEN_KEY_CURRENT: '2',
    INSTAGRAM_COMMENTER_HASH_KEY: b64(3),
    INSTAGRAM_OPT_OUT_KEY: b64(4),
  };

  it('키가 하나도 없거나 공백뿐이면 null(기능 꺼짐)이고 운영 필수 키가 아니다', () => {
    expect(parseInstagramSettings({})).toBeNull();
    expect(parseInstagramSettings({ META_APP_ID: '  ', INSTAGRAM_OPT_OUT_KEY: '' })).toBeNull();
    for (const key of INSTAGRAM_REQUIRED_KEYS) {
      expect(PRODUCTION_REQUIRED_KEYS as readonly string[]).not.toContain(key);
    }
    expect(productionConfigProblems(PRODUCTION)).toEqual([]);
  });

  it('전부 있으면 키를 해석하고 시간당 한도는 비면 700이다', () => {
    const settings = parseInstagramSettings(INSTAGRAM)!;
    expect(settings).toMatchObject({
      appId: 'app-id',
      appSecret: 'meta-app-secret-value',
      loginConfigId: 'config-id',
      webhookVerifyToken: 'verify-token-value',
      dmHourlyLimit: 700,
    });
    expect(settings.tokenKeyring.current).toBe(2);
    expect([...settings.tokenKeyring.keys.keys()]).toEqual([1, 2]);
    expect(settings.commenterHashKey).toEqual(Buffer.alloc(32, 3));
    expect(settings.optOutKey).toEqual(Buffer.alloc(32, 4));
    expect(parseInstagramSettings({ ...INSTAGRAM, INSTAGRAM_DM_HOURLY_LIMIT: ' 500 ' })?.dmHourlyLimit).toBe(500);
  });

  it.each(INSTAGRAM_REQUIRED_KEYS)('%s만 빠져도 그 이름을 담아 기동을 거부한다', (key) => {
    let message = '';
    try {
      parseInstagramSettings({ ...INSTAGRAM, [key]: ' ' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(`Instagram DM 설정은 전부 있거나 전부 없어야 합니다. 비어 있음: ${key}`);
    expect(message).not.toContain('meta-app-secret-value');
  });

  it('값 형식이 틀리면 값 없이 키 이름만 담아 거부한다', () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ INSTAGRAM_TOKEN_KEYS: 'not-a-keyring' }, 'INSTAGRAM_TOKEN_KEYS'],
      [{ INSTAGRAM_TOKEN_KEYS: `1:${Buffer.alloc(16, 1).toString('base64')}` }, 'INSTAGRAM_TOKEN_KEYS'],
      [{ INSTAGRAM_TOKEN_KEY_CURRENT: '3' }, 'INSTAGRAM_TOKEN_KEY_CURRENT'],
      [{ INSTAGRAM_COMMENTER_HASH_KEY: 'short' }, 'INSTAGRAM_COMMENTER_HASH_KEY'],
      [{ INSTAGRAM_OPT_OUT_KEY: 'short' }, 'INSTAGRAM_OPT_OUT_KEY'],
      [{ INSTAGRAM_DM_HOURLY_LIMIT: '0' }, 'INSTAGRAM_DM_HOURLY_LIMIT'],
    ];
    for (const [patch, keyName] of cases) {
      let message = '';
      try {
        parseInstagramSettings({ ...INSTAGRAM, ...patch });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(keyName);
      for (const secret of [b64(1), b64(3), 'meta-app-secret-value']) expect(message).not.toContain(secret);
    }
  });

  it('토큰 키·해시 키·수신 거부 키가 겹치면 거부한다', () => {
    const error = 'INSTAGRAM_TOKEN_KEYS·INSTAGRAM_COMMENTER_HASH_KEY·INSTAGRAM_OPT_OUT_KEY는 서로 다른 키여야 합니다.';
    expect(() => parseInstagramSettings({ ...INSTAGRAM, INSTAGRAM_OPT_OUT_KEY: b64(3) })).toThrow(new Error(error));
    expect(() => parseInstagramSettings({ ...INSTAGRAM, INSTAGRAM_COMMENTER_HASH_KEY: b64(1) })).toThrow(
      new Error(error),
    );
    expect(() => parseInstagramSettings({ ...INSTAGRAM, INSTAGRAM_OPT_OUT_KEY: b64(2) })).toThrow(new Error(error));
  });

  describe('AppConfig', () => {
    const saved = { ...process.env };
    const reset = () => {
      for (const key of INSTAGRAM_REQUIRED_KEYS) delete process.env[key];
      Object.assign(process.env, {
        DATABASE_URL: 'postgresql://localhost/test',
        WEB_URL: 'https://links.example/',
        SHORT_LINK_BASE_URL: 'https://go.example',
        FILE_STORAGE: 'disk',
      });
    };

    beforeEach(reset);
    afterAll(() => {
      process.env = saved;
    });

    it('설정이 없으면 getter가 null이고 기동은 통과한다', () => {
      const config = new AppConfig();
      expect(() => config.onModuleInit()).not.toThrow();
      expect(config.instagram).toBeNull();
    });

    it('전부 있으면 웹 콜백 주소를 더해 돌려준다', () => {
      Object.assign(process.env, INSTAGRAM);
      expect(new AppConfig().instagram?.redirectUri).toBe('https://links.example/me/integrations/instagram/callback');
    });

    it('일부만 있으면 onModuleInit이 기동을 거부한다', () => {
      process.env.INSTAGRAM_OPT_OUT_KEY = b64(4);
      expect(() => new AppConfig().onModuleInit()).toThrow(/META_APP_ID.*INSTAGRAM_COMMENTER_HASH_KEY/);
    });
  });
});
