import { InstabioSource, instabioImage, instabioUrl, parseInstabio } from './instabio-source';

const sourceUrl = 'https://instabio.cc/Example123';
const html = `<script>window.__data=${JSON.stringify({ state: 1, ui: { state: 1, title: '테스트', desc: '광고 고지' }, bio: { id: 'Example123' } })};</script>`;
const link = (id: number, extra = {}) => ({
  id,
  title: `상품${id}`,
  link: `https://shop.example/a/${id}?affiliate=keep`,
  state: 1,
  type: 1,
  order: 10 - id,
  ...extra,
});
const payload = (links: unknown[] = [link(1), link(2)]) => ({
  linkid: 'Example123',
  cmpts: JSON.stringify([{ id: 'buttons', state: 1, subtype: 'cmpt-button-buttonLink', links }]),
  orders: '["buttons"]',
  pages: [],
});

it('입력은 고정 HTTPS 호스트·페이지 id만 쓰며 추적 쿼리를 버린다', () => {
  expect(instabioUrl(`${sourceUrl}?fbclid=drop#drop`).href).toBe(sourceUrl);
  for (const value of [
    'http://instabio.cc/Example123',
    'https://instabio.cc.evil.test/Example123',
    'https://user@instabio.cc/Example123',
    'https://instabio.cc:444/Example123',
    'https://127.0.0.1/Example123',
    'https://instabio.cc/a/b',
    'https://instabio.cc/abc%2Fdef',
    'file:///etc/passwd',
  ])
    expect(() => instabioUrl(value)).toThrow();
  expect(instabioImage('https://bio.linkcdn.cc/upload/abc123/2026110612/123.jpg')).toBeTruthy();
  for (const value of [
    'https://bio.linkcdn.cc.evil.test/upload/abc/1/1.jpg',
    'https://bio.linkcdn.cc/upload/abc/1/1.svg',
    'https://bio.linkcdn.cc/upload/abc/1/1.jpg?redirect=evil',
    'https://user@bio.linkcdn.cc/upload/abc/1/1.jpg',
  ])
    expect(instabioImage(value)).toBeNull();
});

it('표시 배열 순서·제휴 쿼리를 보존하고 정해진 공개 필드만 반환한다', () => {
  const preview = parseInstabio(sourceUrl, html, payload());
  expect(preview.links.map((item) => item.title)).toEqual(['상품1', '상품2']);
  expect(preview.links[0].url).toBe('https://shop.example/a/1?affiliate=keep');
  expect(preview.profile).toEqual({ displayName: '테스트', bio: '광고 고지', avatarUrl: null });
  expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(parseInstabio(sourceUrl, html, payload([link(2)])).fingerprint).not.toBe(preview.fingerprint);
});

it('숨김·예약·잠금·잘못된 조건·script URL은 제외하고 구조 변경은 실패한다', () => {
  const preview = parseInstabio(
    sourceUrl,
    html,
    payload([
      link(1),
      link(2, { state: 0 }),
      link(3, { other: '{"scheduled":1}' }),
      link(4, { other: '{"actionLock":{"lock":"code"}}' }),
      link(5, { other: 'broken' }),
      link(6, { link: 'javascript:alert(1)' }),
    ]),
  );
  expect(preview.links.map((item) => item.title)).toEqual(['상품1']);
  expect(preview.warnings.length).toBeGreaterThan(0);
  expect(() => parseInstabio(sourceUrl, '<script>throw new Error()</script>', payload())).toThrow();
  expect(() => parseInstabio(sourceUrl, html, { ...payload(), linkid: 'another' })).toThrow();
});

it('본문 실제 바이트 제한과 리디렉트 금지를 적용한다', async () => {
  const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('too large'));
  try {
    await expect(new InstabioSource().read(sourceUrl, 3)).rejects.toThrow();
    expect(spy).toHaveBeenCalledWith(
      sourceUrl,
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    );
    spy.mockRejectedValue(new Error('redirect'));
    await expect(new InstabioSource().preview(sourceUrl)).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
});

it('한 원본 요청이 실패해도 다른 요청 종료까지 기다리고 오류 응답 본문을 취소한다', async () => {
  const source = new InstabioSource();
  let release!: () => void;
  let ended = false;
  const read = jest
    .spyOn(source, 'read')
    .mockRejectedValueOnce(new Error('404'))
    .mockImplementationOnce(async (_url, _max, signal) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      expect(signal?.aborted).toBe(true);
      ended = true;
      throw new Error('aborted');
    });
  const request = source.preview(sourceUrl);
  let settled = false;
  const outcome = request.catch(() => {
    settled = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  await outcome;
  expect(ended).toBe(true);
  read.mockRestore();
  const cancel = jest.fn();
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 404 }));
  try {
    await expect(source.read(sourceUrl, 1024)).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
