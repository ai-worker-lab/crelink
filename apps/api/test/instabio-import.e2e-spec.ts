import {
  type CreatorLandingState,
  type InstabioImportPreview,
  type InstabioImportRequest,
  type InstabioImportResult,
} from '@crelink/shared';
import { InstabioSource } from '../src/creator/instabio-source';
import { LinksService } from '../src/creator/links.service';
import { api, createTestApp, login, type TestApp } from './test-app';

const preview: InstabioImportPreview = {
  sourceUrl: 'https://instabio.cc/Example123',
  fingerprint: 'f'.repeat(64),
  profile: {
    displayName: '이전 프로필',
    bio: '제휴 수수료 안내',
    avatarUrl: 'https://bio.linkcdn.cc/upload/example/20261106/10.png',
  },
  links: [1, 2].map((n) => ({
    id: `item${n}`,
    title: `상품${n}`,
    url: `https://shop.example/a/${n}?affiliate=keep`,
    imageUrl: `https://bio.linkcdn.cc/upload/example/20261106/${n}.png`,
  })),
  warnings: [],
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe('Instabio 가져오기 HTTP·DB', () => {
  let t: TestApp;
  let n = 0;
  let source: InstabioSource;
  beforeAll(async () => {
    t = await createTestApp();
    source = t.app.get(InstabioSource);
  });
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(() => {
    jest.spyOn(source, 'preview').mockResolvedValue(structuredClone(preview));
    jest.spyOn(source, 'read').mockResolvedValue(PNG);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await t.pool.query("DELETE FROM blocked_domains WHERE domain='shop.example'");
  });
  async function creator() {
    const result = await login(t.baseUrl, `import-${++n}|import${n}@example.com`);
    return { cookie: result.cookie!, userId: result.body.user!.id };
  }
  const state = async (cookie: string) =>
    (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
  const payload = (current?: CreatorLandingState): InstabioImportRequest => ({
    url: preview.sourceUrl,
    fingerprint: preview.fingerprint,
    links: preview.links.map(({ id, title }) => ({ id, title })),
    replaceProfile: Boolean(current),
    ...(current
      ? {
          expectedProfile: {
            displayName: current.landing.displayName,
            bio: current.landing.bio,
            avatarFileId: current.landing.avatar?.fileId ?? null,
          },
        }
      : {}),
  });
  const apply = (cookie: string, body: unknown) =>
    api<InstabioImportResult & { code?: string }>(t.baseUrl, 'POST', '/api/me/imports/instabio', { cookie, body });

  it('비로그인 거부·미리보기 무변경·계정 격리·제목 수정·원본 순서·이미지 복사·중복 재시도', async () => {
    for (const path of ['/api/me/imports/instabio', '/api/me/imports/instabio/preview'])
      expect((await api(t.baseUrl, 'POST', path, { body: {} })).status).toBe(401);
    const a = await creator(),
      b = await creator();
    await api(t.baseUrl, 'POST', '/api/me/links', {
      cookie: a.cookie,
      body: { title: '기존', url: 'https://old.example/' },
    });
    const before = await state(a.cookie);
    expect(
      (
        await api(t.baseUrl, 'POST', '/api/me/imports/instabio/preview', {
          cookie: a.cookie,
          body: { url: preview.sourceUrl },
        })
      ).status,
    ).toBe(200);
    expect((await state(a.cookie)).links).toEqual(before.links);
    expect(
      (await t.pool.query('SELECT count(*)::int AS n FROM files WHERE owner_user_id=$1', [a.userId])).rows[0].n,
    ).toBe(0);
    const request = payload(before);
    request.links.reverse();
    request.links[1].title = '수정 상품';
    const saved = await apply(a.cookie, request);
    expect(saved.status).toBe(200);
    expect(saved.body.links.map((link) => link.title)).toEqual(['수정 상품', '상품2']);
    const after = await state(a.cookie);
    expect(after.links.map((link) => link.title)).toEqual(['기존', '수정 상품', '상품2']);
    expect(after.links.slice(1).map((link) => link.url)).toEqual(preview.links.map((link) => link.url));
    expect(after.landing).toMatchObject({ displayName: preview.profile.displayName, bio: preview.profile.bio });
    expect((await state(b.cookie)).links).toEqual([]);
    for (const image of [after.landing.avatar!, ...after.links.slice(1).map((link) => link.thumbnail!)]) {
      expect(image.url).not.toContain('linkcdn');
      const response = await fetch(`${t.baseUrl}/api/files/${image.fileId}`);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
      expect(
        (await t.pool.query('SELECT owner_user_id FROM files WHERE id=$1', [image.fileId])).rows[0].owner_user_id,
      ).toBe(a.userId);
    }
    const retry = await apply(a.cookie, payload());
    expect(retry.body).toMatchObject({ links: [], skipped: 2, profile: null });
    expect((await state(a.cookie)).links).toHaveLength(3);
  });

  it('변경 원본·없는 항목·제목 한도·바뀐 프로필은 저장하지 않는다', async () => {
    const a = await creator(),
      before = await state(a.cookie);
    const changed = await apply(a.cookie, { ...payload(), fingerprint: 'old' });
    expect([changed.status, changed.body.code]).toEqual([409, 'import_source_changed']);
    expect((await apply(a.cookie, { ...payload(), links: [{ id: 'unknown', title: 'x' }] })).status).toBe(400);
    expect((await apply(a.cookie, { ...payload(), links: [{ id: 'item1', title: 'x'.repeat(61) }] })).status).toBe(400);
    await api(t.baseUrl, 'PATCH', '/api/me/landing', { cookie: a.cookie, body: { bio: '다른 탭에서 저장' } });
    const result = await apply(a.cookie, payload(before));
    expect([result.status, result.body.code]).toEqual([409, 'import_profile_changed']);
    expect((await state(a.cookie)).links).toEqual([]);
    expect((await state(a.cookie)).landing.bio).toBe('다른 탭에서 저장');
  });

  it('배치 중 두번째 INSERT 실패는 링크와 프로필 전체를 되돌린다', async () => {
    const a = await creator(),
      before = await state(a.cookie);
    const links = t.app.get(LinksService),
      real = links.createInTransaction.bind(links);
    let call = 0;
    jest.spyOn(links, 'createInTransaction').mockImplementation(async (...args) => {
      if (++call === 2) throw new Error('test insert failed');
      return real(...args);
    });
    expect((await apply(a.cookie, payload(before))).status).toBe(500);
    const after = await state(a.cookie);
    expect(after.links).toEqual([]);
    expect(after.landing).toEqual(before.landing);
  });

  it('한도는 동시 단일 추가 뒤 다시 검사하고 차단 도메인도 거부한다', async () => {
    const a = await creator();
    const { rows } = await t.pool.query(
      "SELECT id FROM landing_blocks WHERE landing_id=(SELECT id FROM landings WHERE user_id=$1) AND type='list'",
      [a.userId],
    );
    await t.pool.query(
      "INSERT INTO links(public_id,user_id,block_id,title,url,host,position) SELECT 'test'||lpad(i::text,6,'0'),$1,$2,'기존','https://old.example/'||i,'old.example',i FROM generate_series(1,48) i",
      [a.userId, rows[0].id],
    );
    const read = source.read.bind(source);
    jest.spyOn(source, 'read').mockImplementationOnce(async (...args) => {
      await api(t.baseUrl, 'POST', '/api/me/links', {
        cookie: a.cookie,
        body: { title: '동시 추가', url: 'https://old.example/49' },
      });
      return read(...args);
    });
    const result = await apply(a.cookie, payload());
    expect([result.status, result.body.code]).toEqual([409, 'link_total_limit_reached']);
    expect((await state(a.cookie)).links).toHaveLength(49);
    const b = await creator();
    await t.pool.query("INSERT INTO blocked_domains(domain) VALUES ('shop.example')");
    expect((await apply(b.cookie, payload())).body.code).toBe('link_domain_blocked');
    expect((await state(b.cookie)).links).toEqual([]);
  });

  it('같은 계정의 겹친 요청은 429, 실패 뒤 다시 사용할 수 있다', async () => {
    const a = await creator();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.spyOn(source, 'preview').mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return preview;
    });
    const first = apply(a.cookie, payload());
    await started;
    const second = await apply(a.cookie, payload());
    expect([second.status, second.body.code]).toEqual([429, 'import_busy']);
    release();
    expect((await first).status).toBe(200);
    expect((await apply(a.cookie, payload())).body.skipped).toBe(2);
  });

  it('손상된 이미지는 링크·프로필 저장 전에 실패한다', async () => {
    const a = await creator(),
      before = await state(a.cookie);
    jest.spyOn(source, 'read').mockResolvedValue(Buffer.from('<svg onload="bad"/>'));
    expect((await apply(a.cookie, payload(before))).body.code).toBe('file_type_unsupported');
    expect((await state(a.cookie)).links).toEqual([]);
    expect((await state(a.cookie)).landing).toEqual(before.landing);
  });
});
