// 광고 블록·배너 슬롯 E2E(검증 계획 1~9). 기준: docs/specs/crelink-ad-banner.md#검증-계획, 화면: design/ad-banner-block/handoff.md
// 크리링 배너(`ad_banners`)는 모든 무료 랜딩이 함께 쓰는 전역 데이터라, 이 파일의 테스트는 한 워커에서 차례로 돕니다(파일 안 병렬 없음).
// 시험마다 자기 운영자가 만든 배너만 게시하고, 정리 때 운영자보다 배너를 먼저 지웁니다(fixtures.ts `removeUsers`).
import type { APIResponse, Locator, Page } from '@playwright/test';
import {
  expect,
  expectNoHorizontalOverflow,
  SHORT_URL,
  test,
  TEST_EMAIL_DOMAIN,
  TINY_GIF_ANIMATED,
  TINY_PNG,
  WEB_URL,
  type E2EData,
} from './fixtures';

interface ImageRef {
  fileId: string;
  url: string;
}
interface AdBanner {
  id: string;
  alt: string;
  url: string;
  status: 'live' | 'scheduled' | 'ended';
}
interface CreatorBanner {
  id: string;
  alt: string;
  url: string | null;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** BFF(`/api/backend/…`)로 상태 변경 요청을 보냅니다. 같은 출처 검사를 통과하도록 Origin을 붙입니다. */
function send(page: Page, method: string, path: string, data?: unknown): Promise<APIResponse> {
  return page.request.fetch(`${WEB_URL}/api/backend${path}`, { method, headers: { Origin: WEB_URL }, data });
}

/** 성공해야 하는 요청: 실패하면 본문과 함께 실패시키고, JSON 본문을 돌려줍니다(204는 undefined). */
async function ok<T>(page: Page, method: string, path: string, data?: unknown): Promise<T> {
  const response = await send(page, method, path, data);
  expect(response.ok(), `${method} ${path} → ${response.status()} ${await response.text()}`).toBe(true);
  return (response.status() === 204 ? undefined : await response.json()) as T;
}

/** 로그인한 사용자 이름으로 이미지를 올립니다(`POST /api/me/files`). */
async function upload(page: Page, name: string, mimeType: string, buffer: Buffer): Promise<ImageRef> {
  const response = await page.request.post(`${WEB_URL}/api/backend/api/me/files`, {
    headers: { Origin: WEB_URL },
    multipart: { file: { name, mimeType, buffer } },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as ImageRef;
}

/** 운영자 세션으로 지금 게시되는 크리링 배너를 API로 등록합니다(정지 PNG). */
async function createAdBanner(page: Page, alt: string, url: string, startsAt = new Date(Date.now() - 60_000)) {
  const image = await upload(page, 'ad.png', 'image/png', TINY_PNG);
  return ok<AdBanner>(page, 'POST', '/api/admin/ad-banners', {
    imageFileId: image.fileId,
    stillImageFileId: null,
    alt,
    url,
    startsAt: startsAt.toISOString(),
    endsAt: null,
  });
}

/** 공개 랜딩 링크 목록의 순서. 광고 블록·배너 슬롯 자리는 `슬롯`입니다. */
function listOrder(scope: Page | Locator): Promise<string[]> {
  return scope
    .locator('.link-list > li')
    .evaluateAll((items) =>
      items.map((item) =>
        item.classList.contains('banner-slot-item') ? '슬롯' : (item.querySelector('.link-title')?.textContent ?? ''),
      ),
    );
}

async function publicIdOf(data: E2EData, table: 'ad_banners' | 'creator_banners', id: string): Promise<string> {
  const { rows } = await data.db.query<{ public_id: string }>(`SELECT public_id FROM ${table} WHERE id = $1`, [id]);
  return rows[0].public_id;
}

/** 한 랜딩에서 센 크리링 배너 노출·클릭 합계(날짜 무관). */
async function adStats(data: E2EData, bannerId: string, landingPublicId: string) {
  const { rows } = await data.db.query<{ impressions: number; clicks: number }>(
    `SELECT coalesce(sum(impressions), 0)::int AS impressions, coalesce(sum(clicks), 0)::int AS clicks
     FROM ad_banner_daily_stats WHERE ad_banner_id = $1 AND landing_public_id = $2`,
    [bannerId, landingPublicId],
  );
  return rows[0];
}

/**
 * 외부 링크 패널(또는 다른 dnd-kit 목록)의 손잡이를 키보드로 옮깁니다. 스페이스로 들고 화살표로 한 칸씩(안내 문장으로 확인) 옮긴 뒤
 * 스페이스로 놓고, 저장 응답(`PUT …order`)을 기다립니다. `name`은 조사까지 붙인 안내 속 이름입니다(예: `크리링 광고 블록을`).
 */
async function moveWithKeyboard(
  page: Page,
  handle: Locator,
  name: string,
  key: 'ArrowUp' | 'ArrowDown',
  positions: number[],
) {
  const announcement = page.locator('[id^="DndLiveRegion-"]');
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  for (const position of positions) {
    // 들어 올린 직후 dnd-kit이 위치를 재기 전에 누른 화살표는 무시되므로 안내가 바뀔 때까지 다시 누릅니다.
    await expect(async () => {
      await page.keyboard.press(key);
      await expect(announcement).toHaveText(`${name} ${position}번째 자리로 옮기고 있어요.`, { timeout: 1000 });
    }).toPass();
  }
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && /\/order$/.test(new URL(response.url()).pathname),
  );
  await page.keyboard.press('Space');
  await expect(announcement).toHaveText(`${name} ${positions.at(-1)}번째 자리에 놓았어요.`);
  expect((await saved).ok()).toBe(true);
}

/** 화면 폭을 바꿔 다시 열고 가로 넘침이 없는지 봅니다. */
async function expectFitsAt(page: Page, widths: number[], label: string) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page, `${label} ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test.beforeAll(async ({ db }) => {
  // 중단된 이전 실행이 게시한 채 남긴 시험 배너는 이 파일의 `게시 n장` 전제를 깨므로 시작할 때 지웁니다.
  await db.query(
    `DELETE FROM ad_banners WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1 AND role = 'operator')`,
    [`%@${TEST_EMAIL_DOMAIN}`],
  );
});

test('무료 랜딩: 광고 블록 맨 뒤·맨 앞·사이, 넘기기(버튼·키보드, 자동 넘김 없음), 숨김, 노출·클릭 기록과 서비스 화면 제외', async ({
  data,
}) => {
  const operator = await data.user({ role: 'operator' });
  const admin = await data.session(operator);
  const creator = await data.user({
    displayName: `E2E 광고 랜딩 ${data.run}`,
    links: [
      { title: '링크 1', url: data.externalUrl('one') },
      { title: '링크 2', url: data.externalUrl('two') },
      { title: '링크 3', url: data.externalUrl('three') },
    ],
  });
  const firstUrl = data.externalUrl('ad-first');
  const first = await createAdBanner(admin.page, `E2E 광고 첫째 ${data.run}`, firstUrl);
  const second = await createAdBanner(admin.page, `E2E 광고 둘째 ${data.run}`, data.externalUrl('ad-second'));
  const firstPublicId = await publicIdOf(data, 'ad_banners', first.id);

  // 1. 단축 주소로 연 공개 랜딩: 맨 뒤 광고 블록, `광고` 배지, 1 / 2, 5초 동안 자동으로 넘어가지 않음
  const visitor = await data.session();
  const page = visitor.page;
  await page.goto(creator.shortUrl);
  await expect(page).toHaveURL(creator.landingUrl);
  const ad = page.getByRole('region', { name: '크리링 광고', exact: true });
  await expect(ad.getByText('광고', { exact: true })).toBeVisible();
  await expect(ad.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '링크 2', '링크 3', '슬롯']);
  await expect.poll(() => adStats(data, first.id, creator.publicId)).toEqual({ impressions: 1, clicks: 0 });
  expect(await adStats(data, second.id, creator.publicId)).toEqual({ impressions: 0, clicks: 0 });
  await page.waitForTimeout(5000);
  await expect(ad.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect(ad.getByRole('button', { name: '이전 배너' })).toBeDisabled();
  await ad.getByRole('button', { name: '다음 배너' }).click();
  await expect(ad.getByText('2 / 2', { exact: true })).toBeVisible();
  await expect(ad.getByRole('button', { name: '다음 배너' })).toBeDisabled();
  await expect(ad.getByText('2장 중 2번째 배너')).toBeAttached();
  // 키보드: 블록 안 ←로 첫 장, 초점은 새 장의 링크
  await ad.getByRole('link', { name: second.alt }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(ad.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect(ad.getByRole('link', { name: first.alt })).toBeFocused();

  // 6. 광고 클릭: {SHORT}/a/{배너}/{랜딩}이 저장된 URL로 302, 클릭 +1(쿠키 없음)
  const adLink = ad.getByRole('link', { name: first.alt });
  await expect(adLink).toHaveAttribute('href', `${SHORT_URL}/a/${firstPublicId}/${creator.publicId}`);
  const redirect = await visitor.context.request.get(`${SHORT_URL}/a/${firstPublicId}/${creator.publicId}`, {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toBe(firstUrl);
  expect(redirect.headers()['cache-control']).toContain('no-store');
  expect(redirect.headers()['set-cookie']).toBeUndefined();
  const arrival = page.waitForRequest((request) => request.url() === firstUrl);
  await adLink.click();
  await arrival;
  await expect.poll(() => adStats(data, first.id, creator.publicId)).toEqual({ impressions: 1, clicks: 2 });
  // 없는 배너·랜딩 주소는 안내 화면
  for (const path of ['/a/zzzzzzzzzz/zzzzzzzzzz', `/a/${firstPublicId}/zzzzzzzzzz`, '/b/zzzzzzzzzz']) {
    const missing = await visitor.context.request.get(`${SHORT_URL}${path}`, { maxRedirects: 0 });
    expect(missing.status(), path).toBe(302);
    expect(missing.headers().location, path).toMatch(/\/notice\?reason=link_unavailable$/);
  }

  // 6. 서비스 화면에서 연 랜딩(운영자 화면의 랜딩 주소 링크, 같은 출처)은 세지 않고 광고 주소는 저장된 URL
  await admin.page.goto(`/admin/creators/${creator.userId}`);
  const opened = admin.page.context().waitForEvent('page');
  await admin.page.getByRole('link', { name: creator.landingUrl }).click();
  const internal = await opened;
  await internal.waitForLoadState();
  await expect(internal).toHaveURL(creator.landingUrl);
  const internalAd = internal.getByRole('region', { name: '크리링 광고', exact: true });
  await expect(internalAd.getByRole('link', { name: first.alt })).toHaveAttribute('href', firstUrl);
  await internal.close();

  // 1. 관리 화면: 외부 링크 패널의 광고 행을 키보드로 맨 앞 → 2번째 링크 다음, 링크 하나를 슬롯 너머로
  const owner = await data.session(creator);
  const me = owner.page;
  await me.goto(`/me/landings/${creator.publicId}`);
  const main = me.getByRole('main');
  const stage = me.getByRole('region', { name: '미리보기', exact: true });
  // 관리 미리보기는 공개 API를 부르지 않으므로 노출이 늘지 않습니다.
  await expect(stage.getByRole('button', { name: '광고 블록 위치 안내' })).toBeVisible();
  await stage.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  const links = main.getByRole('region', { name: '외부 링크', exact: true });
  await expect(links.getByText('보이는 링크 3/5')).toBeVisible();
  const adHandle = links.getByRole('button', { name: '크리링 광고 블록 순서 바꾸기' });
  const adRow = links
    .getByRole('listitem')
    .filter({ has: me.getByRole('button', { name: '크리링 광고 블록 순서 바꾸기' }) });
  await expect(adRow.getByText('지울 수 없고 위치만 바꿀 수 있어요')).toBeVisible();
  await expect(adRow.getByRole('switch')).toHaveCount(0);
  await expect(adRow.getByRole('button', { name: /삭제|수정/ })).toHaveCount(0);

  await moveWithKeyboard(me, adHandle, '크리링 광고 블록을', 'ArrowUp', [3, 2, 1]);
  await expect(links.getByText('보이는 링크 3/5')).toBeVisible();
  await expect.poll(() => listOrder(stage)).toEqual(['슬롯', '링크 1', '링크 2', '링크 3']);
  await page.goto(creator.shortUrl);
  await expect.poll(() => listOrder(page)).toEqual(['슬롯', '링크 1', '링크 2', '링크 3']);

  await moveWithKeyboard(me, adHandle, '크리링 광고 블록을', 'ArrowDown', [2, 3]);
  await page.goto(creator.shortUrl);
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '링크 2', '슬롯', '링크 3']);
  await me.reload();
  await expect.poll(() => listOrder(stage)).toEqual(['링크 1', '링크 2', '슬롯', '링크 3']);
  await main.locator('[data-section="ad-slot"]').click();
  await expect(main.getByText('2번째 링크 다음')).toBeVisible();
  await main.getByRole('button', { name: '외부 링크 목록에서 끌어 옮기기' }).click();
  await expect(adHandle).toBeFocused();

  await moveWithKeyboard(
    me,
    links.getByRole('button', { name: '링크 3 순서 바꾸기' }),
    '링크 3 링크를',
    'ArrowUp',
    [3],
  );
  await page.goto(creator.shortUrl);
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '링크 2', '링크 3', '슬롯']);
  await expect.poll(() => adStats(data, first.id, creator.publicId)).toEqual({ impressions: 4, clicks: 2 });

  // 6. 운영자 표의 노출·클릭은 DB 누적과 같음(다른 시험 랜딩의 노출도 함께 쌓이므로 같은 순간의 값으로 비교)
  await admin.page.goto('/admin/ad-banners');
  const firstRow = admin.page.getByRole('row', { name: new RegExp(escape(first.alt)) });
  await expect(async () => {
    await admin.page.reload();
    const { rows } = await data.db.query<{ impressions: number; clicks: number }>(
      `SELECT coalesce(sum(impressions), 0)::int AS impressions, coalesce(sum(clicks), 0)::int AS clicks
       FROM ad_banner_daily_stats WHERE ad_banner_id = $1`,
      [first.id],
    );
    await expect(firstRow.locator('.ad-col-stat').first()).toHaveText(`노출 ${rows[0].impressions}`, { timeout: 1000 });
    await expect(firstRow.locator('.ad-col-clicks')).toHaveText(`클릭 ${rows[0].clicks}`, { timeout: 1000 });
  }).toPass();

  // 2. 숨김: 운영자가 모두 내리면 공개 랜딩에 광고 블록이 없고, 미리보기는 같은 자리에 점선 안내
  for (const banner of [first, second]) await ok(admin.page, 'PUT', `/api/admin/ad-banners/${banner.id}/end`);
  await page.goto(creator.shortUrl);
  await expect(page.getByRole('link', { name: '링크 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: '크리링 광고', exact: true })).toHaveCount(0);
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '링크 2', '링크 3']);
  await me.reload();
  await expect(
    stage.getByText('광고 블록 · 지금은 게시 중인 크리링 광고가 없어 방문자에게 보이지 않아요'),
  ).toBeVisible();
  await main.locator('[data-section="ad-slot"]').click();
  await expect(main.getByText('지금은 게시 중인 크리링 광고가 없어 방문자에게 보이지 않아요.')).toBeVisible();

  // 2. 다시 게시한 뒤 링크를 모두 숨기면 광고도 없음(빈 랜딩) → 포트폴리오를 더하면 링크 목록 자리에 광고 블록만
  const again = await createAdBanner(admin.page, `E2E 광고 다시 ${data.run}`, data.externalUrl('ad-again'));
  await page.goto(creator.shortUrl);
  await expect(page.getByRole('region', { name: '크리링 광고', exact: true })).toBeVisible();
  for (const link of creator.links) await ok(me, 'PATCH', `/api/me/links/${link.id}`, { hidden: true });
  await page.goto(creator.shortUrl);
  await expect(page.getByText('아직 올린 링크가 없어요.')).toBeVisible();
  await expect(page.getByRole('region', { name: '크리링 광고', exact: true })).toHaveCount(0);
  await ok(me, 'POST', '/api/me/portfolio', { title: `E2E 작품 ${data.run}` });
  await page.goto(creator.shortUrl);
  await expect(
    page.getByRole('region', { name: '크리링 광고', exact: true }).getByRole('link', { name: again.alt }),
  ).toBeVisible();
  await expect.poll(() => listOrder(page)).toEqual(['슬롯']);
  await expect(page.getByRole('heading', { name: '포트폴리오' })).toBeVisible();
});

test('운영자 크리링 배너: 등록 오류(주소 형식·차단 도메인·기간), 예약, 순서, 내리기·게시 0장 경고, 움직이는 배너 정지 이미지, 차단 도메인 추가로 끝남', async ({
  data,
}) => {
  const operator = await data.user({ role: 'operator' });
  const { page } = await data.session(operator);
  const creator = await data.user({ links: [{ title: '링크 1', url: data.externalUrl('one') }] });
  const blocked = data.blockedDomain();
  await ok(page, 'POST', '/api/admin/blocked-domains', { domain: blocked, reason: 'E2E 광고 차단' });

  await page.goto('/admin');
  await page.getByRole('navigation', { name: '운영자 메뉴' }).getByRole('link', { name: '광고 배너' }).click();
  await expect(page).toHaveURL(`${WEB_URL}/admin/ad-banners`);
  await expect(page.getByRole('heading', { name: '광고 배너', level: 1 })).toBeVisible();
  await expect(page.getByText('지금 게시 중인 배너가 없어 모든 랜딩에서 광고 블록이 숨어 있어요.')).toBeVisible();

  // 등록: 오류 셋을 차례로 확인한 뒤 저장
  const altA = `E2E 운영 배너 가 ${data.run}`;
  const urlA = data.externalUrl('ad-a');
  await page.getByRole('button', { name: '배너 등록' }).click();
  const dialog = page.getByRole('dialog', { name: '배너 등록' });
  await expect(dialog.getByLabel('대체 문구 (필수)')).toBeFocused();
  await dialog.getByLabel('이미지 (필수)').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(dialog.getByRole('img', { name: '이미지 (필수) 미리보기' })).toBeVisible();
  await dialog.getByLabel('대체 문구 (필수)').fill(altA);
  await expect(
    dialog.getByRole('region', { name: '크리링 광고 미리보기' }).getByRole('img', { name: altA }),
  ).toBeVisible();
  data.allowConsoleError(/status of 4(00|22) .*\/api\/backend\/api\/admin\/ad-banners$/);
  await dialog.getByLabel('연결 URL (필수)').fill(`ftp://${data.unique('ftp')}.e2e.test/file`);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByText('http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.')).toBeVisible();
  await dialog.getByLabel('연결 URL (필수)').fill(`https://www.${blocked}/promo`);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByText('크리링 차단 목록에 있는 도메인이라 저장할 수 없어요.')).toBeVisible();
  await dialog.getByLabel('연결 URL (필수)').fill(urlA);
  await dialog.getByLabel('게시 시작 (필수)').fill('2030-01-02T10:00');
  await dialog.getByLabel('게시 끝').fill('2030-01-01T10:00');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.getByText('게시 끝은 시작보다 뒤여야 해요.')).toBeVisible();
  await dialog.getByLabel('게시 끝').fill('');
  const now = new Date(Date.now() + 9 * 3600_000 - 60_000).toISOString().slice(0, 16);
  await dialog.getByLabel('게시 시작 (필수)').fill(now);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`'${altA}' 배너를 등록했어요. 목록 맨 뒤에 들어가요.`)).toBeVisible();
  await expect(page.getByText('지금 게시 중인 배너가 없어', { exact: false })).toHaveCount(0);

  // 9. 움직이는 GIF: 첫 장면 정지 이미지를 함께 올려 저장
  const altGif = `E2E 움직이는 배너 ${data.run}`;
  await page.getByRole('button', { name: '배너 등록' }).click();
  await dialog
    .getByLabel('이미지 (필수)')
    .setInputFiles({ name: 'move.gif', mimeType: 'image/gif', buffer: TINY_GIF_ANIMATED });
  await expect(
    dialog.getByText('움직이는 이미지라 첫 장면 정지 이미지를 함께 올렸어요.', { exact: false }),
  ).toBeVisible();
  await dialog.getByLabel('대체 문구 (필수)').fill(altGif);
  await dialog.getByLabel('연결 URL (필수)').fill(data.externalUrl('ad-gif'));
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const { rows: gifRows } = await data.db.query<{ still_animated: boolean | null; image_animated: boolean | null }>(
    `SELECT s.animated AS still_animated, i.animated AS image_animated
     FROM ad_banners b JOIN files i ON i.id = b.image_file_id JOIN files s ON s.id = b.still_file_id WHERE b.alt = $1`,
    [altGif],
  );
  expect(gifRows).toEqual([{ still_animated: false, image_animated: true }]);

  // 미래 시작 배너는 `예약`에만, 공개 랜딩에는 없음
  const altFuture = `E2E 예약 배너 ${data.run}`;
  await page.getByRole('button', { name: '배너 등록' }).click();
  await dialog.getByLabel('이미지 (필수)').setInputFiles({ name: 'f.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(dialog.getByRole('img', { name: '이미지 (필수) 미리보기' })).toBeVisible();
  await dialog.getByLabel('대체 문구 (필수)').fill(altFuture);
  await dialog.getByLabel('연결 URL (필수)').fill(data.externalUrl('ad-future'));
  await dialog.getByLabel('게시 시작 (필수)').fill('2099-01-01T09:00');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const filters = page.getByRole('group', { name: '상태로 걸러 보기' });
  await expect(filters.getByRole('button', { name: '예약 1' })).toBeVisible();
  await expect(filters.getByRole('button', { name: '게시 중 2' })).toBeVisible();
  await filters.getByRole('button', { name: '예약 1' }).click();
  const table = page.getByRole('table', { name: '광고 배너 목록' });
  await expect(table.getByRole('rowheader')).toHaveText([altFuture]);
  await filters.getByRole('button', { name: '전체 3' }).click();
  await expect(table.getByRole('rowheader')).toHaveText([altA, altGif, altFuture]);

  const visitor = await data.session();
  await visitor.page.goto(creator.shortUrl);
  const ad = visitor.page.getByRole('region', { name: '크리링 광고', exact: true });
  const alts = () =>
    ad.locator('img.banner-image').evaluateAll((images) => images.map((image) => image.getAttribute('alt')));
  await expect.poll(alts).toEqual([altA, altGif]);

  // `전체`에서 순서 바꾸기(키보드) → 공개 랜딩 순서도 같음
  await moveWithKeyboard(
    page,
    table.getByRole('button', { name: `${altGif} 순서 바꾸기` }),
    `${altGif} 배너를`,
    'ArrowUp',
    [1],
  );
  await expect(page.getByText(`${altGif} 배너를 1번째로 옮겼어요.`)).toBeVisible();
  await visitor.page.goto(creator.shortUrl);
  await expect.poll(alts).toEqual([altGif, altA]);

  // 수정: 대화상자에서 연결 URL만 바꿔 저장(바뀐 필드만 PATCH) → 공개 랜딩 광고 주소도 새 URL
  const movedUrl = data.externalUrl('ad-a-moved');
  await table.getByRole('button', { name: `${altA} 수정` }).click();
  const editDialog = page.getByRole('dialog', { name: '배너 수정' });
  await expect(editDialog.getByLabel('대체 문구 (필수)')).toHaveValue(altA);
  await editDialog.getByLabel('연결 URL (필수)').fill(movedUrl);
  const patched = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes('/api/backend/api/admin/ad-banners/'),
  );
  await editDialog.getByRole('button', { name: '저장', exact: true }).click();
  expect((await patched).postDataJSON()).toEqual({ url: movedUrl });
  await expect(editDialog).toHaveCount(0);
  await expect(page.getByText(`'${altA}' 배너를 저장했어요.`)).toBeVisible();
  const { rows: movedRows } = await data.db.query<{ url: string }>('SELECT url FROM ad_banners WHERE alt = $1', [altA]);
  expect(movedRows).toEqual([{ url: movedUrl }]);

  // 9. 움직이는 배너: 보통 설정은 `움직임 멈추기` 버튼, 누르면 정지 이미지로. 움직임 줄이기 설정은 처음부터 정지 이미지이고 버튼 없음
  const { rows: stillRows } = await data.db.query<{ still_file_id: string }>(
    'SELECT still_file_id FROM ad_banners WHERE alt = $1',
    [altGif],
  );
  const stillPath = stillRows[0].still_file_id;
  const gifImage = ad.getByRole('img', { name: altGif });
  await expect(ad.getByRole('button', { name: '움직임 멈추기' })).toBeVisible();
  await ad.getByRole('button', { name: '움직임 멈추기' }).click();
  await expect(ad.getByRole('button', { name: '다시 재생' })).toBeVisible();
  await expect.poll(() => gifImage.evaluate((image: HTMLImageElement) => image.currentSrc)).toContain(stillPath);
  const calm = await data.session(undefined, { reducedMotion: 'reduce' });
  await calm.page.goto(creator.shortUrl);
  const calmAd = calm.page.getByRole('region', { name: '크리링 광고', exact: true });
  await expect(calmAd.getByRole('img', { name: altGif })).toBeVisible();
  await expect(calmAd.getByRole('button', { name: '움직임 멈추기' })).toBeHidden();
  await expect
    .poll(() => calmAd.getByRole('img', { name: altGif }).evaluate((image: HTMLImageElement) => image.currentSrc))
    .toContain(stillPath);

  // 7. 차단 도메인 추가: 게시 중 크리링 배너는 끝남이 되고, 기간만 고쳐 다시 열면 422
  const blockedLater = data.blockedDomain();
  const altBlocked = `E2E 나중 차단 배너 ${data.run}`;
  const doomed = await createAdBanner(page, altBlocked, `https://ads.${blockedLater}/x`);
  await ok(page, 'POST', '/api/admin/blocked-domains', { domain: blockedLater, reason: 'E2E 나중 차단' });
  const { rows: doomedRows } = await data.db.query<{ ended: boolean }>(
    'SELECT ends_at IS NOT NULL AND ends_at <= now() AS ended FROM ad_banners WHERE id = $1',
    [doomed.id],
  );
  expect(doomedRows).toEqual([{ ended: true }]);
  const reopen = await send(page, 'PATCH', `/api/admin/ad-banners/${doomed.id}`, { endsAt: null });
  expect(reopen.status()).toBe(422);
  expect((await reopen.json()).code).toBe('link_domain_blocked');

  // 내리기(확인) → 끝남, 공개 랜딩에서 빠짐. 모두 내리면 게시 0장 경고
  await page.reload();
  page.on('dialog', (prompt) => void prompt.accept());
  await table.getByRole('button', { name: `${altA} 내리기` }).click();
  await expect(page.getByText(`'${altA}' 배너를 내렸어요.`)).toBeVisible();
  const rowA = table.getByRole('row', { name: new RegExp(escape(altA)) });
  await expect(rowA.getByText('끝남', { exact: true })).toBeVisible();
  await visitor.page.goto(creator.shortUrl);
  await expect.poll(alts).toEqual([altGif]);
  await table.getByRole('button', { name: `${altGif} 내리기` }).click();
  await expect(page.getByText('지금 게시 중인 배너가 없어 모든 랜딩에서 광고 블록이 숨어 있어요.')).toBeVisible();
  await expect(filters.getByRole('button', { name: '끝남 3' })).toBeVisible();
  await visitor.page.goto(creator.shortUrl);
  await expect(visitor.page.getByRole('link', { name: '링크 1' })).toBeVisible();
  await expect(ad).toHaveCount(0);

  // 8. 운영자 광고 배너 화면 390·700·1280px 가로 넘침 없음
  await expectFitsAt(page, [390, 700, 1280], '/admin/ad-banners');
});

test('배너 슬롯: 부여 → 숨김(0장) → 추가(필수·차단 도메인) → 한도 n → 409 되돌림 → 배너 차단 → 클릭 기록 → 회수·보관·재부여, 편집 중 회수, 차단 도메인 추가', async ({
  data,
}) => {
  test.slow();
  const operator = await data.user({ role: 'operator' });
  const admin = await data.session(operator);
  const name = `E2E 배너 크리에이터 ${data.run}`;
  const creator = await data.user({
    displayName: name,
    links: [
      { title: '링크 1', url: data.externalUrl('one') },
      { title: '링크 2', url: data.externalUrl('two') },
    ],
  });
  const ad = await createAdBanner(admin.page, `E2E 슬롯 광고 ${data.run}`, data.externalUrl('ad-slot'));
  const owner = await data.session(creator);
  const me = owner.page;
  // 광고 블록을 1번째 링크 다음으로
  await ok(me, 'PUT', '/api/me/links/order', { ids: creator.links.map((link) => link.id), slotIndex: 1 });
  const visitor = await data.session();
  const page = visitor.page;
  await page.goto(creator.shortUrl);
  await expect(
    page.getByRole('region', { name: '크리링 광고', exact: true }).getByRole('link', { name: ad.alt }),
  ).toBeVisible();
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '슬롯', '링크 2']);

  // 4. 운영자가 부여(확인) → 보이는 배너 0장이라 같은 자리가 숨음
  admin.page.on('dialog', (prompt) => void prompt.accept());
  await admin.page.goto(`/admin/creators/${creator.userId}`);
  const slotGroup = admin.page.getByRole('group', { name: '배너 슬롯' });
  await slotGroup.getByRole('button', { name: '배너 슬롯 부여' }).click();
  await expect(slotGroup.getByText('배너 슬롯을 부여했어요.')).toBeVisible();
  await expect(slotGroup.getByText('부여됨', { exact: false })).toBeVisible();
  await page.goto(creator.shortUrl);
  await expect(page.getByRole('link', { name: '링크 2' })).toBeVisible();
  await expect(page.getByRole('region', { name: '크리링 광고', exact: true })).toHaveCount(0);
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '링크 2']);

  // 4. 크리에이터: 배너 슬롯 패널 → 배너 추가(이미지·대체 문구 필수, URL 선택, 차단 도메인 거부)
  const blocked = data.blockedDomain();
  await ok(admin.page, 'POST', '/api/admin/blocked-domains', { domain: blocked, reason: 'E2E 배너 도메인 차단' });
  await me.goto(`/me/landings/${creator.publicId}`);
  const main = me.getByRole('main');
  const stage = me.getByRole('region', { name: '미리보기', exact: true });
  await expect(stage.getByText('배너 슬롯 · 보이는 배너가 없어 방문자에게 보이지 않아요')).toBeVisible();
  await main.locator('[data-section="banner-slot"]').click();
  await expect(main.getByRole('heading', { name: '배너 슬롯', level: 2, exact: true })).toBeFocused();
  await expect(main.getByText('보이는 배너 0/5장')).toBeVisible();
  await expect(main.getByText('보이는 배너가 없어 방문자 화면에서 배너 슬롯이 보이지 않아요.')).toBeVisible();
  await main.getByRole('button', { name: '배너 추가', exact: true }).click();
  const form = main.getByRole('form', { name: '새 배너' });
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form.getByText('배너 이미지를 올려 주세요.')).toBeVisible();
  await expect(form.getByText('대체 문구를 적어 주세요.')).toBeVisible();
  await form.getByLabel('이미지 (필수)').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(form.getByRole('img', { name: '이미지 (필수) 미리보기' })).toBeVisible();
  const altOne = `E2E 내 배너 1 ${data.run}`;
  await form.getByLabel('대체 문구 (필수)').fill(altOne);
  await form.getByLabel('연결 URL').fill(`https://shop.${blocked}/sale`);
  data.allowConsoleError(/status of 422 .*\/api\/backend\/api\/me\/banners$/);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form.getByText('크리링 차단 목록에 있는 도메인이라 저장할 수 없어요.')).toBeVisible();
  const urlOne = data.externalUrl('banner-one');
  await form.getByLabel('연결 URL').fill(urlOne);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(main.getByText(`'${altOne}' 배너를 추가했어요.`)).toBeVisible();
  await expect(main.getByText('보이는 배너 1/5장')).toBeVisible();

  // 공개 랜딩: 같은 자리에 배지 없는 배너 슬롯(1장이면 조작 줄 없음), 클릭 주소는 {SHORT}/b/{배너}
  await page.goto(creator.shortUrl);
  const slot = page.getByRole('region', { name: `${name} 배너`, exact: true });
  await expect(slot.getByRole('link', { name: altOne })).toBeVisible();
  await expect(slot.getByText('광고', { exact: true })).toHaveCount(0);
  await expect(slot.getByRole('button', { name: '다음 배너' })).toHaveCount(0);
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '슬롯', '링크 2']);
  const { rows: oneRows } = await data.db.query<{ id: string; public_id: string }>(
    'SELECT id, public_id FROM creator_banners WHERE alt = $1',
    [altOne],
  );
  const one = oneRows[0];
  await expect(slot.getByRole('link', { name: altOne })).toHaveAttribute('href', `${SHORT_URL}/b/${one.public_id}`);

  // 6. 배너 클릭: /b/가 302하고 creator_banner_clicks(visitor_id·IP) 기록
  const arrival = page.waitForRequest((request) => request.url() === urlOne);
  await slot.getByRole('link', { name: altOne }).click();
  await arrival;
  await expect
    .poll(async () => {
      const { rows } = await data.db.query<{ visitor_id: string | null; ip: string | null }>(
        'SELECT visitor_id, ip::text AS ip FROM creator_banner_clicks WHERE banner_id = $1',
        [one.id],
      );
      return rows.map((row) => !!row.visitor_id && !!row.ip);
    })
    .toEqual([true]);

  // 4. 보이는 배너 n(5)장이면 `배너 추가`가 막힘. 숨긴 배너를 다시 보이게 하면 409 안내와 스위치 되돌림
  const image = await upload(me, 'more.png', 'image/png', TINY_PNG);
  const extra: CreatorBanner[] = [];
  for (const index of [2, 3, 4, 5]) {
    extra.push(
      await ok<CreatorBanner>(me, 'POST', '/api/me/banners', {
        imageFileId: image.fileId,
        alt: `E2E 내 배너 ${index} ${data.run}`,
      }),
    );
  }
  await me.reload();
  await main.locator('[data-section="banner-slot"]').click();
  await expect(main.getByText('보이는 배너 5/5장')).toBeVisible();
  await expect(
    main.getByText('보이는 배너는 5장까지예요. 다른 배너를 숨기거나 지우면 새 배너를 추가할 수 있어요.'),
  ).toBeVisible();
  await expect(main.getByRole('button', { name: '배너 추가', exact: true })).toHaveCount(0);
  const hideFive = main.getByRole('switch', { name: `${extra[3].alt} 숨기기` });
  await hideFive.click();
  await expect(main.getByText(`'${extra[3].alt}' 배너를 숨겼어요.`)).toBeVisible();
  await expect(hideFive).toHaveAttribute('aria-checked', 'true');
  await expect(main.getByText('숨긴 배너 포함 전체 5/20장')).toBeVisible();
  const altSix = `E2E 내 배너 6 ${data.run}`;
  await ok(me, 'POST', '/api/me/banners', { imageFileId: image.fileId, alt: altSix });
  await me.reload();
  await main.locator('[data-section="banner-slot"]').click();
  data.allowConsoleError(/status of 409 .*\/api\/backend\/api\/me\/banners\/[^/]+$/);
  await hideFive.click();
  await expect(
    main.getByText('보이는 배너는 5장까지예요. 다른 배너를 숨기면 이 배너를 보이게 할 수 있어요.'),
  ).toBeVisible();
  await expect(hideFive).toHaveAttribute('aria-checked', 'true');
  const hiddenClick = await visitor.context.request.get(
    `${SHORT_URL}/b/${await publicIdOf(data, 'creator_banners', extra[3].id)}`,
    { maxRedirects: 0 },
  );
  expect(hiddenClick.headers().location).toMatch(/\/notice\?reason=link_unavailable$/);

  // 공개 랜딩은 보이는 5장을 넘겨 봄
  await page.goto(creator.shortUrl);
  await expect(slot.getByText('1 / 5', { exact: true })).toBeVisible();

  // 4. 배너 순서: 패널에서 키보드로 3번째 배너를 맨 앞으로 → 공개 랜딩 첫 장도 그 배너
  await moveWithKeyboard(
    me,
    main.getByRole('button', { name: `${extra[1].alt} 순서 바꾸기` }),
    `${extra[1].alt} 배너를`,
    'ArrowUp',
    [2, 1],
  );
  await page.goto(creator.shortUrl);
  await expect(slot.locator('.banner-slide').first().getByRole('img')).toHaveAttribute('alt', extra[1].alt);

  // 4. 운영자가 배너 하나를 차단 → 패널에 `차단됨`·사유, 스위치 잠김. 주소를 바꿔도 차단 유지, 클릭 주소는 안내
  await admin.page.reload();
  const bannerCard = admin.page.getByRole('region', { name: '배너', exact: true });
  const oneItem = bannerCard.getByRole('listitem').filter({ has: admin.page.getByRole('heading', { name: altOne }) });
  await oneItem.getByLabel('차단 사유 (선택)').fill('E2E 배너 차단');
  await oneItem.getByRole('button', { name: '차단', exact: true }).click();
  await expect(oneItem.getByText('배너를 차단했어요.')).toBeVisible();
  await expect(oneItem.getByText('사유: E2E 배너 차단')).toBeVisible();
  await me.reload();
  await main.locator('[data-section="banner-slot"]').click();
  const oneRow = main.getByRole('listitem').filter({ has: me.getByRole('button', { name: `${altOne} 배너 수정` }) });
  await expect(oneRow.getByText('차단됨', { exact: true })).toBeVisible();
  await expect(oneRow.getByText('사유: E2E 배너 차단', { exact: false })).toBeVisible();
  await expect(oneRow.getByRole('switch', { name: `${altOne} 숨기기` })).toHaveAttribute('aria-disabled', 'true');
  await ok(me, 'PATCH', `/api/me/banners/${one.id}`, { url: data.externalUrl('banner-one-moved') });
  const { rows: stillBlocked } = await data.db.query<{ blocked: boolean }>(
    'SELECT blocked_at IS NOT NULL AS blocked FROM creator_banners WHERE id = $1',
    [one.id],
  );
  expect(stillBlocked).toEqual([{ blocked: true }]);
  const blockedClick = await visitor.context.request.get(`${SHORT_URL}/b/${one.public_id}`, { maxRedirects: 0 });
  expect(blockedClick.headers().location).toMatch(/\/notice\?reason=link_unavailable$/);
  // 차단으로 보이는 배너가 4장이 되어 숨긴 배너를 다시 보이게 할 수 있음
  await page.goto(creator.shortUrl);
  await expect(slot.getByText('1 / 4', { exact: true })).toBeVisible();
  await expect(slot.getByRole('img', { name: altOne })).toHaveCount(0);

  // R10: 운영자 상세 `배너별 클릭`
  await admin.page.reload();
  await expect(
    admin.page
      .getByRole('table', { name: '배너별 클릭 수' })
      .getByRole('row', { name: new RegExp(`${escape(altOne)}\\s+1`) }),
  ).toHaveCount(1);

  // 4. 회수 → 같은 자리에 광고 블록, 배너 카드에는 보관 배너가 남음
  await slotGroup.getByRole('button', { name: '배너 슬롯 회수' }).click();
  await expect(slotGroup.getByText('배너 슬롯을 회수했어요.')).toBeVisible();
  await expect(slotGroup.getByText('보관 중인 배너 6장', { exact: false })).toBeVisible();
  await expect(bannerCard.getByRole('listitem')).toHaveCount(6);
  await page.goto(creator.shortUrl);
  await expect(
    page.getByRole('region', { name: '크리링 광고', exact: true }).getByRole('link', { name: ad.alt }),
  ).toBeVisible();
  await expect(slot).toHaveCount(0);
  await expect.poll(() => listOrder(page)).toEqual(['링크 1', '슬롯', '링크 2']);

  // 4. 다시 부여 → 이전 배너 그대로
  await slotGroup.getByRole('button', { name: '배너 슬롯 부여' }).click();
  await expect(slotGroup.getByText('배너 슬롯을 부여했어요.')).toBeVisible();
  await page.goto(creator.shortUrl);
  await expect(slot.getByText('1 / 4', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '크리링 광고', exact: true })).toHaveCount(0);

  // 7. 차단 도메인 추가: 그 도메인의 크리에이터 배너는 차단됨
  const lateDomain = data.blockedDomain();
  const lateBanner = await ok<CreatorBanner>(me, 'PATCH', `/api/me/banners/${extra[0].id}`, {
    url: `https://www.${lateDomain}/p`,
  });
  await ok(admin.page, 'POST', '/api/admin/blocked-domains', { domain: lateDomain, reason: 'E2E 나중 차단' });
  const { rows: lateRows } = await data.db.query<{ blocked: boolean; reason: string | null }>(
    'SELECT blocked_at IS NOT NULL AS blocked, blocked_reason AS reason FROM creator_banners WHERE id = $1',
    [lateBanner.id],
  );
  expect(lateRows).toEqual([{ blocked: true, reason: 'E2E 나중 차단' }]);

  // 4. 배너 삭제(확인) → 패널에서 사라지고 보관 수가 줄어듦
  me.on('dialog', (prompt) => void prompt.accept());
  await me.reload();
  await main.locator('[data-section="banner-slot"]').click();
  await main.getByRole('button', { name: `${altSix} 배너 수정` }).click();
  await main
    .getByRole('form', { name: `${altSix} 배너 수정` })
    .getByRole('button', { name: '삭제' })
    .click();
  await expect(main.getByText(`'${altSix}' 배너를 지웠어요.`)).toBeVisible();
  await expect(main.getByText('숨긴 배너 포함 전체 5/20장')).toBeVisible();

  // 5. 편집 중 회수: 배너 폼을 연 채 운영자가 회수 → 저장하면 회수 안내, 처음 패널로, 초안은 버림
  await me.reload();
  await main.locator('[data-section="banner-slot"]').click();
  await main.getByRole('button', { name: '배너 추가', exact: true }).click();
  await form.getByLabel('이미지 (필수)').setInputFiles({ name: 'late.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(form.getByRole('img', { name: '이미지 (필수) 미리보기' })).toBeVisible();
  await form.getByLabel('대체 문구 (필수)').fill(`E2E 회수 중 배너 ${data.run}`);
  await ok(admin.page, 'PUT', `/api/admin/creators/${creator.userId}/banner-slot`, { granted: false });
  data.allowConsoleError(/status of 403 .*\/api\/backend\/api\/me\/banners$/);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(main.getByText('배너 슬롯이 회수되어 이 자리에 다시 크리링 광고 블록이 나와요.')).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(main.locator('[data-section="ad-slot"]')).toBeVisible();
  await expect(main.locator('[data-section="banner-slot"]')).toHaveCount(0);
  await expect(stage.getByText('저장하지 않은 변경 포함')).toHaveCount(0);
  const { rows: count } = await data.db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM creator_banners WHERE user_id = $1',
    [creator.userId],
  );
  expect(count).toEqual([{ n: 5 }]);

  // 운영자 차단 풀기, 크리에이터 상세 390·1280px
  await admin.page.reload();
  await oneItem.getByRole('button', { name: '차단 풀기' }).click();
  await expect(oneItem.getByText('차단을 풀었어요.')).toBeVisible();
  const { rows: unblocked } = await data.db.query<{ blocked: boolean }>(
    'SELECT blocked_at IS NOT NULL AS blocked FROM creator_banners WHERE id = $1',
    [one.id],
  );
  expect(unblocked).toEqual([{ blocked: false }]);
  await expectFitsAt(admin.page, [390, 1280], '/admin/creators/{id}');
});

test('방명록·반응형: 방명록을 켠 랜딩에서 광고는 링크 탭에만, 공개 랜딩(320·390·1280)·페이지 편집(390·1280) 가로 넘침 없음', async ({
  data,
}) => {
  const operator = await data.user({ role: 'operator' });
  const admin = await data.session(operator);
  const creator = await data.user({
    displayName: `E2E 반응형 ${data.run}`,
    links: [
      {
        title: '아주 긴 링크 제목이 들어간 첫 번째 링크로 좁은 화면의 줄바꿈을 확인합니다',
        url: data.externalUrl('long'),
      },
      { title: '링크 2', url: data.externalUrl('two') },
    ],
  });
  const ad = await createAdBanner(admin.page, `E2E 반응형 광고 ${data.run}`, data.externalUrl('ad-wide'));
  await createAdBanner(admin.page, `E2E 반응형 광고 둘째 ${data.run}`, data.externalUrl('ad-wide-2'));
  const owner = await data.session(creator);
  await ok(owner.page, 'PATCH', '/api/me/landing', { guestbookEnabled: true });

  const { page } = await data.session();
  await page.goto(creator.shortUrl);
  const region = page.getByRole('region', { name: '크리링 광고', exact: true });
  await expect(page.getByRole('tab', { name: '링크' })).toHaveAttribute('aria-selected', 'true');
  await expect(region.getByRole('link', { name: ad.alt })).toBeVisible();
  await page.getByRole('tab', { name: '방명록' }).click();
  await expect(page.getByRole('tab', { name: '방명록' })).toHaveAttribute('aria-selected', 'true');
  await expect(region).toBeHidden();
  await page.getByRole('tab', { name: '링크' }).click();
  await expect(region).toBeVisible();
  await expectFitsAt(page, [320, 390, 1280], '/p/{id}');

  await owner.page.goto(`/me/landings/${creator.publicId}`);
  await expect(
    owner.page
      .getByRole('region', { name: '미리보기', exact: true })
      .getByRole('button', { name: '광고 블록 위치 안내' }),
  ).toBeVisible();
  await expectFitsAt(owner.page, [390, 1280], '/me/landings/{id}');

  // 1023px 이하: 미리보기의 `광고 블록 · 위치` 칩 → 하단 시트 `광고 블록` → `외부 링크 목록에서 끌어 옮기기`는 광고 행 손잡이로 초점
  await owner.page.setViewportSize({ width: 390, height: 844 });
  await owner.page.reload();
  await owner.page.getByRole('button', { name: '광고 블록 위치 안내' }).click();
  const adSheet = owner.page.getByRole('dialog', { name: '광고 블록' });
  await adSheet.getByRole('button', { name: '외부 링크 목록에서 끌어 옮기기' }).click();
  await expect(
    owner.page.getByRole('dialog', { name: '외부 링크' }).getByRole('button', { name: '크리링 광고 블록 순서 바꾸기' }),
  ).toBeFocused();
});
