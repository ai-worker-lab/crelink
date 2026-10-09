// 링크 슬롯 +5 이벤트(R24) 검증 계획 1~6. 기준: docs/specs/crelink-slot-event.md#검증-계획, 화면 문구: design/slot-event/handoff.md
// 이벤트는 모든 화면이 함께 보는 전역 데이터라 Playwright 프로젝트 `slot-event`(다른 시나리오 뒤 한 워커)에서 돌고,
// 테스트마다 기간을 열린 상태로 맞춘 뒤 끝나면 원래 값으로 되돌립니다.
import type { Page } from '@playwright/test';
import { expect, expectMobileFits, test, WEB_URL, type E2EData, type SeededUser } from './fixtures';

const EVENT_CODE = 'link-slots-plus-5';
const EVENT_NAME = '외부 링크 +5 이벤트';
/** `CRELINK_API_PATHS.meSlotEventEntry`(e2e는 공유 패키지를 불러오지 않고 다른 시나리오처럼 경로를 적습니다). */
const ENTRY_PATH = '/api/me/slot-event/entry';

interface Period {
  starts_at: Date;
  ends_at: Date | null;
}

/** 지금 기간을 읽어 두고 "한 시간 전 시작·끝 없음"(열림)으로 맞춥니다. 돌려준 함수가 원래 값으로 되돌립니다. */
async function openEvent(data: E2EData): Promise<() => Promise<void>> {
  const { rows } = await data.db.query<Period>('SELECT starts_at, ends_at FROM slot_events WHERE code = $1', [
    EVENT_CODE,
  ]);
  expect(rows, '0005 migration이 시드한 이벤트 행').toHaveLength(1);
  const original = rows[0];
  await data.db.query(`UPDATE slot_events SET starts_at = now() - interval '1 hour', ends_at = NULL WHERE code = $1`, [
    EVENT_CODE,
  ]);
  return async () => {
    await data.db.query('UPDATE slot_events SET starts_at = $2, ends_at = $3 WHERE code = $1', [
      EVENT_CODE,
      original.starts_at,
      original.ends_at,
    ]);
  };
}

const fiveLinks = (data: E2EData) =>
  ['하나', '둘', '셋', '넷', '다섯'].map((title) => ({ title, url: data.externalUrl(title) }));

async function entryCount(data: E2EData, user: SeededUser): Promise<number> {
  const { rows } = await data.db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM slot_event_entries WHERE user_id = $1',
    [user.userId],
  );
  return rows[0].count;
}

/** 브라우저 컨텍스트의 세션 쿠키로 BFF를 거쳐 신청합니다(화면 밖 재신청·마감 뒤 신청 확인용). BFF는 같은 출처 상태 변경만 받으므로 Origin을 붙입니다. */
async function applyByRequest(page: Page) {
  return page.request.post(`${WEB_URL}/api/backend${ENTRY_PATH}`, {
    headers: { Accept: 'application/json', Origin: WEB_URL },
  });
}

/** 관리 화면 `페이지 편집`에서 외부 링크 패널을 엽니다(1280px: 오른쪽 패널). */
async function openLinksPanel(page: Page) {
  const stage = page.getByRole('region', { name: '미리보기', exact: true });
  await stage.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  return page.getByRole('main').getByRole('region', { name: '외부 링크', exact: true });
}

test('홈 안내 → 신청 → 한도 +5, 재신청 멱등, 추가 슬롯과 따로 합산, 운영자 신청자 목록', async ({ data }) => {
  const restore = await openEvent(data);
  try {
    // 1. 로그인 전 홈
    const visitor = await data.session();
    await visitor.page.goto('/');
    const homeEvent = visitor.page.getByRole('region', { name: EVENT_NAME });
    await expect(homeEvent).toBeVisible();
    await expect(
      homeEvent.getByText(/가입하고 이벤트를 신청하면 보이는 외부 링크를 5개 더 둘 수 있어요/),
    ).toBeVisible();
    await expect(visitor.page.getByRole('link', { name: '구글로 시작하기' })).toBeVisible();
    await expectMobileFits(visitor.page, '홈(이벤트 열림)');

    // 2. 신청: 보이는 링크 5개(한도 참)인 크리에이터
    const creator = await data.user({ displayName: `E2E 이벤트 ${data.run}`, links: fiveLinks(data) });
    const other = await data.user();
    const { page } = await data.session(creator);
    await page.goto(`/me/landings/${creator.publicId}`);
    const band = page.getByRole('main').getByRole('region', { name: EVENT_NAME });
    await expect(band.getByRole('button', { name: '신청하기' })).toBeVisible();
    await expectMobileFits(page, '페이지 편집(이벤트 띠)');

    const links = await openLinksPanel(page);
    await expect(links.getByText('보이는 링크 5/5')).toBeVisible();
    await expect(
      links.getByText('보이는 링크 한도(5개)에 도달했어요. 이벤트를 신청하면 5개 더 둘 수 있어요.', { exact: false }),
    ).toBeVisible();
    await expect(links.getByRole('button', { name: '링크 추가', exact: true })).toHaveCount(0);
    await links.getByRole('button', { name: '신청하기' }).click();
    await expect(
      links.getByText('이벤트를 신청했어요. 이제 보이는 외부 링크를 10개까지 둘 수 있어요.').first(),
    ).toBeVisible();
    await expect(links.getByText('보이는 링크 5/10')).toBeVisible();
    await expect(links.getByText('이벤트 보너스 +5 받음')).toBeVisible();
    expect(await entryCount(data, creator)).toBe(1);

    // 6번째 링크가 보너스로 들어감
    await links.getByRole('button', { name: '링크 추가', exact: true }).click();
    const addForm = page.getByRole('main').getByRole('form', { name: '새 링크', exact: true });
    await addForm.getByLabel('표시 이름 (필수)').fill('여섯 번째');
    await addForm.getByLabel('주소 (필수)').fill(data.externalUrl('sixth'));
    await addForm.getByRole('button', { name: '저장', exact: true }).click();
    await expect(links.getByText('보이는 링크 6/10')).toBeVisible();

    // 다시 열면 띠가 없고, 같은 계정 재신청은 200(행 1개 그대로)
    await page.reload();
    await expect(page.getByRole('main').getByRole('region', { name: EVENT_NAME })).toHaveCount(0);
    const again = await applyByRequest(page);
    expect(again.status()).toBe(200);
    expect(await entryCount(data, creator)).toBe(1);

    // 로그인 후 홈은 관리 화면으로 보냄
    await page.goto('/');
    await expect(
      page.getByRole('region', { name: EVENT_NAME }).getByRole('link', { name: '내 크리링에서 신청하기' }),
    ).toHaveAttribute('href', '/me');

    // 3. 신청하지 않은 계정은 그대로
    const otherSession = await data.session(other);
    await otherSession.page.goto(`/me/landings/${other.publicId}`);
    const otherLinks = await openLinksPanel(otherSession.page);
    await expect(otherLinks.getByText('보이는 링크 0/5')).toBeVisible();

    // 4. 운영자 추가 슬롯과 따로 합산
    const operator = await data.user({ role: 'operator' });
    const admin = (await data.session(operator)).page;
    await admin.goto(`/admin/creators/${creator.userId}`);
    await expect(admin.getByText('보이는 링크 한도 = 무료 5개 + 추가 슬롯 0개 + 이벤트 5개')).toBeVisible();
    await admin.getByLabel('추가 링크 슬롯').fill('2');
    await expect(admin.getByText('보이는 링크 한도 = 무료 5개 + 추가 슬롯 2개 + 이벤트 5개')).toBeVisible();
    await admin.getByRole('button', { name: '슬롯 저장' }).click();
    await expect(admin.getByText('추가 슬롯을 저장했어요.')).toBeVisible();
    await expect(admin.getByText('보이는 링크 6/12', { exact: false })).toBeVisible();
    await admin.getByLabel('추가 링크 슬롯').fill('0');
    await admin.getByRole('button', { name: '슬롯 저장' }).click();
    await expect(admin.getByText('보이는 링크 6/10', { exact: false })).toBeVisible();
    await expectMobileFits(admin, '/admin/creators/{id}(이벤트 신청함)');

    // 5. 운영자 이벤트 화면
    await admin.goto('/admin/slot-event');
    await expect(admin.getByRole('heading', { name: EVENT_NAME, level: 1 })).toBeVisible();
    await expect(admin.getByText('진행 중', { exact: true })).toBeVisible();
    const applicants = admin.getByRole('table', { name: '이벤트 신청자 목록' });
    await expect(applicants.getByRole('link', { name: creator.email })).toHaveAttribute(
      'href',
      `/admin/creators/${creator.userId}`,
    );
    await expect(applicants.getByRole('link', { name: other.email })).toHaveCount(0);
    await expectMobileFits(admin, '/admin/slot-event');
  } finally {
    await restore();
  }
});

test('기간 끝: 운영자가 끝을 저장하면 새 신청 409·안내 숨김, 받은 보너스는 유지', async ({ data }) => {
  const restore = await openEvent(data);
  try {
    const applied = await data.user({ links: fiveLinks(data) });
    const late = await data.user();
    const appliedPage = (await data.session(applied)).page;
    await appliedPage.goto('/');
    expect((await applyByRequest(appliedPage)).status()).toBe(201);

    // 운영자 화면: 끝 < 시작이면 화면 오류, 지금(분 단위 내림)을 끝으로 저장하면 끝남
    const operator = await data.user({ role: 'operator' });
    const admin = (await data.session(operator)).page;
    await admin.goto('/admin/slot-event');
    const start = admin.getByLabel('시작 (필수)');
    const end = admin.getByLabel('끝', { exact: true });
    const startValue = await start.inputValue();
    expect(startValue).not.toBe('');
    await end.fill('2000-01-01T00:00');
    await admin.getByRole('button', { name: '기간 저장' }).click();
    await expect(admin.getByText('끝은 시작보다 뒤여야 해요.')).toBeVisible();
    const nowSeoul = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date())
      .replace(' ', 'T');
    await end.fill(nowSeoul);
    await admin.getByRole('button', { name: '기간 저장' }).click();
    await expect(admin.getByText('이벤트 기간을 저장했어요.')).toBeVisible();
    await expect(admin.getByText('끝남', { exact: true })).toBeVisible();

    // 늦은 계정: 띠 없음, 신청 409
    const latePage = (await data.session(late)).page;
    await latePage.goto(`/me/landings/${late.publicId}`);
    await expect(latePage.getByRole('main')).toBeVisible();
    await expect(latePage.getByRole('main').getByRole('region', { name: EVENT_NAME })).toHaveCount(0);
    const closed = await applyByRequest(latePage);
    expect(closed.status()).toBe(409);
    expect((await closed.json()).code).toBe('slot_event_closed');
    expect(await entryCount(data, late)).toBe(0);

    // 홈 안내 숨김
    await latePage.goto('/');
    await expect(latePage.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(latePage.getByRole('region', { name: EVENT_NAME })).toHaveCount(0);

    // 신청한 계정은 보너스 유지
    await appliedPage.goto(`/me/landings/${applied.publicId}`);
    const links = await openLinksPanel(appliedPage);
    await expect(links.getByText('보이는 링크 5/10')).toBeVisible();
    await expect(links.getByText('이벤트 보너스 +5 받음')).toBeVisible();
  } finally {
    await restore();
  }
});
