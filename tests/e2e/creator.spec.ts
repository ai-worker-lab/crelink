// 검증 계획 E2E 1: 크리에이터 편집 흐름. 기준: docs/specs/crelink-mvp.md#검증-계획, 관리 화면 `/me/landings/{publicId}`(PRD R18),
// 화면 구성: design/preview-direct-edit/handoff.md(미리보기 직접 편집·프로필 메뉴).
import type { Locator, Page } from '@playwright/test';
import { expect, expectMobileFits, expectNoHorizontalOverflow, SHORT_URL, test, TINY_PNG, WEB_URL } from './fixtures';

/**
 * 넓은 화면(1280px) `페이지 편집`의 외부 링크 패널에서 링크를 하나 추가합니다. `링크 추가`를 누르면 패널이 `새 링크` 폼으로 바뀌고
 * (초점은 패널 제목), 저장하면 결과 안내와 함께 외부 링크 패널로 돌아옵니다.
 */
async function addLink(main: Locator, title: string, url: string) {
  await main.getByRole('button', { name: '링크 추가', exact: true }).click();
  await expect(main.getByRole('heading', { name: '새 링크', level: 2, exact: true })).toBeFocused();
  const form = main.getByRole('form', { name: '새 링크', exact: true });
  await form.getByLabel('표시 이름 (필수)').fill(title);
  await form.getByLabel('주소 (필수)').fill(url);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  const links = main.getByRole('region', { name: '외부 링크', exact: true });
  await expect(links.getByText(`'${title}' 링크를 추가했어요.`)).toBeVisible();
  await expect(links.getByRole('button', { name: `${title} 수정`, exact: true })).toBeVisible();
}

/**
 * 손잡이를 마우스로 눌러 대상 카드 위치까지 끌어 놓습니다(dnd-kit PointerSensor는 4px 넘게 움직여야 시작).
 * 마우스 좌표는 화면 기준이라 손잡이가 화면 밖이면 끌기가 시작되지 않으므로 먼저 손잡이를 화면 안으로 스크롤합니다.
 */
async function dragWithMouse(page: Page, handle: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('끌기 대상 위치를 찾지 못했어요.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 });
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

/** 미리보기 링크를 누르는 동안 문서 이동·새 창이 생기는지 모읍니다. */
async function navigationsDuring(page: Page, action: () => Promise<void>): Promise<string[]> {
  const navigations: string[] = [];
  const onRequest = (request: { url(): string; isNavigationRequest(): boolean }) => {
    if (request.isNavigationRequest()) navigations.push(request.url());
  };
  const onPage = (opened: Page) => navigations.push(opened.url());
  page.on('request', onRequest);
  page.context().on('page', onPage);
  try {
    await action();
  } finally {
    page.off('request', onRequest);
    page.context().off('page', onPage);
  }
  return navigations;
}

test('크리에이터: /me 이동, 주소 막대, 프로필 메뉴(프로필·SNS), 미리보기 고르기 → 패널 편집(포트폴리오·외부 링크: 초안 유지·한도·숨기기·드래그·삭제), 주소 설정(복사·30일 제한), 390px 편집|미리보기·하단 시트', async ({
  data,
}) => {
  const creator = await data.user();
  const { context, page } = await data.session(creator);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });
  const managePath = `/me/landings/${creator.publicId}`;
  const shortHost = new URL(SHORT_URL).host;
  // 1024px 이상: 가운데 무대(region '미리보기' = 주소 막대 + 휴대폰 미리보기)와 오른쪽 편집 패널(main).
  // 같은 이름(링크 추가·포트폴리오 등)이 둘 다에 있어 범위를 나눠 찾습니다.
  const main = page.getByRole('main');
  const stage = page.getByRole('region', { name: '미리보기', exact: true });
  const draftChip = stage.getByText('저장하지 않은 변경 포함');
  const previewTitles = stage.locator('.link-title');
  const menu = page.getByRole('navigation', { name: '관리 메뉴' });
  const back = main.getByRole('button', { name: '전체', exact: true });
  const panelTitle = (name: string) => main.getByRole('heading', { name, level: 2, exact: true });
  const pick = (name: string) => stage.getByRole('button', { name, exact: true });

  // /me는 내 랜딩 관리 화면의 `페이지 편집`으로 307 이동
  const me = await page.request.get(`${WEB_URL}/me`, { maxRedirects: 0 });
  expect(me.status(), '/me 이동').toBe(307);
  expect(new URL(me.headers().location, WEB_URL).pathname).toBe(managePath);
  await page.goto('/me');
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  await expect(page.getByRole('heading', { name: '페이지 편집', level: 1 })).toBeVisible();
  await expect(menu.getByRole('link', { name: '페이지 편집' })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: '프로필' })).toHaveAttribute('href', `${managePath}/profile`);
  // 머리글은 로그아웃만(크리에이터에게 `운영자 화면` 없음). 공개 페이지 열기는 무대 주소 막대로 옮겨 머리글에 없음
  const header = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(header.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(header.getByRole('link', { name: '운영자 화면' })).toHaveCount(0);
  await expect(header.getByRole('link', { name: '공개 페이지 열기' })).toHaveCount(0);
  await expect(main.getByRole('region', { name: '내 페이지' })).toHaveCount(0);
  // 주소 막대: 단축 주소(`http(s)://` 없이)·복사·주소 변경·공개 페이지 열기(새 창)
  await expect(stage.locator('code.url-text')).toHaveText(`${shortHost}/${creator.slug}`);
  await expect(stage.getByRole('button', { name: '내 크리링 링크 복사' })).toBeVisible();
  const openPublic = stage.getByRole('link', { name: '공개 페이지 열기 (새 창)', exact: true });
  await expect(openPublic).toHaveAttribute('href', creator.landingUrl);
  await expect(openPublic).toHaveAttribute('target', '_blank');
  await expect(stage.getByText('아직 준비 중인 페이지예요.')).toBeVisible();
  // 처음 패널: 구역 목록(외부 링크·포트폴리오·방명록과 상태)과 프로필 메뉴 안내
  await expect(main.getByRole('button', { name: /외부 링크.*보이는 링크 0\/5/ })).toBeVisible();
  await expect(main.getByRole('button', { name: /포트폴리오.*0\/20/ })).toBeVisible();
  await expect(main.getByRole('button', { name: /방명록.*켜짐/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 미리보기의 프로필 머리를 고르면 패널이 프로필 안내로 바뀌고 초점은 패널 제목. 고치는 곳은 프로필 메뉴
  await pick('프로필 편집').click();
  await expect(panelTitle('프로필')).toBeFocused();
  await expect(main.locator('.summary-name')).toHaveText('이름 없음');
  await main.getByRole('link', { name: '프로필에서 고치기' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}/profile`);
  await expect(menu.getByRole('link', { name: '프로필' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: '프로필', level: 1 })).toBeVisible();
  // 프로필 메뉴의 미리보기는 강조 모드라 고르기 버튼이 없음
  await expect(pick('프로필 편집')).toHaveCount(0);
  await expect(pick('외부 링크 구역 편집')).toHaveCount(0);

  // 프로필: 사진(작은 PNG)·이름·소개. 저장 전 입력이 미리보기에 바로 보이고 카드·무대에 저장 안 함 표시
  const profile = main.getByRole('region', { name: '프로필', exact: true });
  await expect(profile.locator('.default-avatar')).toBeVisible();
  await profile
    .getByLabel('프로필 사진')
    .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(profile.getByRole('img', { name: '프로필 사진 미리보기' })).toBeVisible();
  await expect(profile.locator('.default-avatar')).toHaveCount(0);
  await profile.getByLabel('이름(닉네임)').fill('E2E 크리에이터');
  await profile.getByLabel('소개').fill('E2E 소개 문구입니다.');
  await expect(profile.getByText('저장 안 함', { exact: true })).toBeVisible();
  await expect(draftChip).toBeVisible();
  await expect(stage.getByRole('heading', { name: 'E2E 크리에이터', level: 2 })).toBeVisible();
  await expect(stage.getByText('E2E 소개 문구입니다.')).toBeVisible();
  await expect(stage.getByRole('img', { name: 'E2E 크리에이터 프로필 사진' })).toBeVisible();
  await profile.getByRole('button', { name: '프로필 저장' }).click();
  await expect(profile.getByText('프로필을 저장했어요.')).toBeVisible();
  await expect(profile.getByText('저장 안 함', { exact: true })).toHaveCount(0);
  await expect(draftChip).toHaveCount(0);

  // SNS: 저장 전 미리보기에 아이콘(프로필 메뉴의 미리보기는 방문자 모습이라 링크)
  const socials = main.getByRole('region', { name: 'SNS 채널', exact: true });
  await socials.getByRole('button', { name: 'SNS 채널 추가' }).click();
  await socials.getByLabel('플랫폼 1').selectOption('youtube');
  const socialUrl = data.externalUrl('@e2e');
  await socials.getByLabel('계정 주소 1').fill(socialUrl);
  await expect(stage.getByRole('list', { name: 'SNS 채널' }).getByRole('link', { name: '유튜브' })).toHaveAttribute(
    'href',
    socialUrl,
  );
  await expect(socials.getByText('저장 안 함', { exact: true })).toBeVisible();
  await socials.getByRole('button', { name: 'SNS 채널 저장' }).click();
  await expect(socials.getByText('SNS 채널을 저장했어요.')).toBeVisible();
  await expect(draftChip).toHaveCount(0);

  // `페이지 편집`의 미리보기: SNS는 링크가 아니라 고르기 버튼. 고르면 프로필 안내(저장한 이름), `전체`로 돌아오면 고른 버튼에 초점
  await menu.getByRole('link', { name: '페이지 편집' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  await expect(page.getByRole('heading', { name: '페이지 편집', level: 1 })).toBeVisible();
  await expect(stage.getByRole('list', { name: 'SNS 채널' }).getByRole('link')).toHaveCount(0);
  await pick('SNS 채널 편집').click();
  await expect(panelTitle('프로필')).toBeFocused();
  await expect(main.locator('.summary-name')).toHaveText('E2E 크리에이터');
  await back.click();
  await expect(page.getByRole('heading', { name: '페이지 편집', level: 1 })).toBeVisible();
  await expect(pick('SNS 채널 편집')).toBeFocused();

  // 포트폴리오: 구역 목록 → 포트폴리오 패널 → `포트폴리오 추가`로 폼(입력 자동 초점 없음, 초점은 패널 제목), 저장 전 미리보기에 항목
  await main.getByRole('button', { name: /포트폴리오.*0\/20/ }).click();
  await expect(panelTitle('포트폴리오')).toBeFocused();
  const portfolio = main.getByRole('region', { name: '포트폴리오', exact: true });
  await expect(portfolio.getByText('아직 등록한 포트폴리오가 없어요.')).toBeVisible();
  await portfolio.getByRole('button', { name: '포트폴리오 추가' }).click();
  await expect(panelTitle('새 포트폴리오')).toBeFocused();
  const portfolioForm = main.getByRole('form', { name: '새 포트폴리오', exact: true });
  await expect(portfolioForm.getByLabel('제목 (필수)')).not.toBeFocused();
  await portfolioForm.getByLabel('제목 (필수)').fill('E2E 협업');
  await portfolioForm.getByLabel('링크', { exact: true }).fill(data.externalUrl('work'));
  await portfolioForm.getByLabel('설명').fill('브랜드 협업 이력');
  await expect(main.getByText('저장 안 함', { exact: true })).toBeVisible();
  await expect(draftChip).toBeVisible();
  await expect(stage.getByRole('region', { name: '포트폴리오' }).locator('.portfolio-title')).toHaveText(['E2E 협업']);
  await portfolioForm.getByRole('button', { name: '저장', exact: true }).click();
  await expect(portfolioForm).toHaveCount(0);
  await expect(portfolio.getByText('포트폴리오 항목을 추가했어요.')).toBeVisible();
  await expect(portfolio.locator('.item-title')).toHaveText(['E2E 협업']);
  await expect(draftChip).toHaveCount(0);
  // 미리보기의 포트폴리오 카드를 고르면 그 항목 폼(저장값), `취소`하면 포트폴리오 패널로
  await pick('E2E 협업 포트폴리오 편집').click();
  await expect(panelTitle('포트폴리오 · E2E 협업')).toBeFocused();
  const portfolioEdit = main.getByRole('form', { name: 'E2E 협업 포트폴리오 수정' });
  await expect(portfolioEdit.getByLabel('제목 (필수)')).toHaveValue('E2E 협업');
  await expect(portfolioEdit.getByRole('button', { name: '삭제' })).toBeVisible();
  await portfolioEdit.getByRole('button', { name: '취소' }).click();
  await expect(panelTitle('포트폴리오')).toBeFocused();
  await back.click();
  await expect(main.getByRole('button', { name: /포트폴리오.*1\/20/ })).toBeVisible();

  // 주소 막대 `주소 변경` → `주소 설정` 메뉴, 새 주소 입력에 초점. 계정 이메일
  await stage.getByRole('link', { name: '주소 변경' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}/settings`);
  await expect(menu.getByRole('link', { name: '주소 설정' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: '주소 설정', level: 1 })).toBeVisible();
  const slugCard = main.getByRole('region', { name: '주소 바꾸기' });
  await expect(slugCard.getByLabel('새 주소')).toBeFocused();
  await expect(main.getByRole('region', { name: '계정' }).getByText(creator.email)).toBeVisible();

  // 단축 URL 표시·복사
  const short = main.getByRole('region', { name: '내 크리링 링크' });
  await expect(short.locator('code.url-text')).toHaveText(creator.shortUrl);
  await short.getByRole('button', { name: '내 크리링 링크 복사' }).click();
  await expect(short.getByText('복사했어요.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(creator.shortUrl);

  // 주소 변경: 자동 주소는 바로 바꿀 수 있음. 바꾸면 주소 막대 주소도 바뀜
  const newSlug = data.unique('e2e-me');
  await expect(slugCard.getByText('자동 발급 주소는 지금 바로 바꿀 수 있어요.', { exact: false })).toBeVisible();
  await slugCard.getByLabel('새 주소').fill(newSlug);
  await expect(slugCard.getByText('사용할 수 있는 주소예요.')).toBeVisible();
  await slugCard.getByRole('button', { name: '주소 바꾸기' }).click();
  await expect(slugCard.getByText('주소를 바꿨어요.', { exact: false })).toBeVisible();
  await expect(short.locator('code.url-text')).toHaveText(`${SHORT_URL}/${newSlug}`);
  await expect(stage.locator('code.url-text')).toHaveText(`${shortHost}/${newSlug}`);
  // 주소 막대의 복사도 바뀐 주소
  await stage.getByRole('button', { name: '내 크리링 링크 복사' }).click();
  await expect(stage.getByText('복사했어요.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${SHORT_URL}/${newSlug}`);

  // 다시 바꾸려 하면 30일 제한 안내(화면은 입력을 막고, API도 429)
  await expect(
    slugCard.getByText('주소는 30일에 한 번 바꿀 수 있어요. 다음 변경 가능일:', { exact: false }),
  ).toBeVisible();
  await expect(slugCard.getByLabel('새 주소')).toBeDisabled();
  const again = await page.request.put(`${WEB_URL}/api/backend/api/me/short-link/slug`, {
    headers: { Origin: WEB_URL },
    data: { slug: data.unique('e2e-again') },
  });
  expect(again.status()).toBe(429);
  expect((await again.json()).code).toBe('slug_change_too_soon');
  await page.reload();
  await expect(
    slugCard.getByText('주소는 30일에 한 번 바꿀 수 있어요. 다음 변경 가능일:', { exact: false }),
  ).toBeVisible();
  await expectMobileFits(page, '주소 설정');

  // `페이지 편집`으로 돌아와 미리보기의 외부 링크 구역을 고르면 외부 링크 패널(초점은 패널 제목)
  await menu.getByRole('link', { name: '페이지 편집' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  await pick('외부 링크 구역 편집').click();
  await expect(panelTitle('외부 링크')).toBeFocused();
  const links = main.getByRole('region', { name: '외부 링크', exact: true });
  // 광고 블록 행(`.slot-edit-card`, 맨 뒤)은 링크가 아니라 뺍니다. 광고 행 정렬은 ad-banner.spec.ts가 봅니다.
  const titles = links.locator('.link-edit-card:not(.slot-edit-card) .link-title');
  await expect(links.getByText('아직 추가한 링크가 없어요.', { exact: false })).toBeVisible();
  await expect(links.getByText('보이는 링크 0/5')).toBeVisible();

  // 미리보기 끝의 `+ 링크 추가`를 누르면 패널이 `새 링크` 폼(대화상자 아님, 입력 자동 초점 없음). 저장 전 입력이 미리보기 끝에 붙고,
  // Esc로 취소하면 사라지며 외부 링크 패널 제목으로 초점
  await pick('+ 링크 추가').click();
  await expect(panelTitle('새 링크')).toBeFocused();
  const draftForm = main.getByRole('form', { name: '새 링크', exact: true });
  await expect(draftForm.getByLabel('표시 이름 (필수)')).not.toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await draftForm.getByLabel('표시 이름 (필수)').fill('초안 링크');
  await expect(previewTitles).toHaveText(['초안 링크']);
  await expect(draftChip).toBeVisible();
  await expect(main.getByText('저장 안 함', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(draftForm).toHaveCount(0);
  await expect(panelTitle('외부 링크')).toBeFocused();
  await expect(previewTitles).toHaveCount(0);
  await expect(draftChip).toHaveCount(0);

  // 링크 5개 → 한도 안내, 패널·미리보기에 추가 버튼 없음, API도 409
  for (let index = 1; index <= 5; index += 1) await addLink(main, `링크 ${index}`, data.externalUrl(`l${index}`));
  await expect(links.getByText('보이는 링크 5/5')).toBeVisible();
  await expect(links.getByText('보이는 링크 한도(5개)에 도달했어요.', { exact: false })).toBeVisible();
  await expect(links.getByRole('button', { name: '링크 추가' })).toHaveCount(0);
  await expect(stage.getByRole('button', { name: '링크 추가' })).toHaveCount(0);
  await expect(stage.getByText('보이는 링크 한도(5개)에 도달했어요.', { exact: false })).toBeVisible();
  await expect(previewTitles).toHaveText(['링크 1', '링크 2', '링크 3', '링크 4', '링크 5']);
  const sixth = await page.request.post(`${WEB_URL}/api/backend/api/me/links`, {
    headers: { Origin: WEB_URL },
    data: { title: '링크 6', url: data.externalUrl('l6') },
  });
  expect(sixth.status(), '보이는 링크 6번째 추가는 API도 거부').toBe(409);
  expect((await sixth.json()).code).toBe('link_limit_reached');

  // 숨기기 스위치 → 흐리게·숨김 배지, 미리보기에서 빠짐, 한도 여유 → 6번째 추가
  const hide1 = links.getByRole('switch', { name: '링크 1 숨기기' });
  await expect(hide1).toHaveAttribute('aria-checked', 'false');
  await hide1.click();
  await expect(links.getByText("'링크 1' 링크를 숨겼어요.")).toBeVisible();
  await expect(hide1).toHaveAttribute('aria-checked', 'true');
  const item1 = links.getByRole('listitem').filter({ has: page.getByRole('button', { name: '링크 1 수정' }) });
  await expect(item1).toHaveClass(/is-hidden/);
  await expect(item1.getByText('숨김', { exact: true }).last()).toBeVisible();
  await expect(links.getByText('보이는 링크 4/5')).toBeVisible();
  await expect(previewTitles).toHaveText(['링크 2', '링크 3', '링크 4', '링크 5']);
  await addLink(main, '링크 6', data.externalUrl('l6'));
  await expect(links.getByText('보이는 링크 5/5')).toBeVisible();

  // 한도가 찬 상태에서 다시 보이게 하면 API 409 → 스위치가 되돌아가고 안내
  data.allowConsoleError(/status of 409 .*\/api\/backend\/api\/me\/links\/[^/\s]+$/);
  await hide1.click();
  await expect(
    links.getByText('보이는 링크 한도에 도달했어요. 다른 링크를 숨기거나 지운 뒤 다시 시도해 주세요.'),
  ).toBeVisible();
  await expect(hide1).toHaveAttribute('aria-checked', 'true');
  await expect(links.getByText('보이는 링크 5/5')).toBeVisible();
  await expect(previewTitles).toHaveText(['링크 2', '링크 3', '링크 4', '링크 5', '링크 6']);

  // 행의 `수정`은 패널을 링크 폼으로 바꿈(행 아래 펼침·`접기` 없음). 표시 이름·설명·썸네일을 고치면 저장 전 미리보기 제자리에 반영
  await links.getByRole('button', { name: '링크 3 수정', exact: true }).click();
  await expect(panelTitle('링크 · 링크 3')).toBeFocused();
  await expect(main.getByRole('button', { name: '링크 3 접기' })).toHaveCount(0);
  const editForm = main.getByRole('form', { name: '링크 3 링크 수정', exact: true });
  await expect(editForm.getByLabel('표시 이름 (필수)')).toHaveValue('링크 3');
  await expect(editForm.getByLabel('표시 이름 (필수)')).not.toBeFocused();
  await editForm.getByLabel('표시 이름 (필수)').fill('링크 3 고침');
  await editForm.getByLabel('설명').fill('E2E 설명');
  await editForm.getByLabel('썸네일').setInputFiles({ name: 'thumb.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(editForm.getByRole('img', { name: '썸네일 미리보기' })).toBeVisible();
  await expect(previewTitles).toHaveText(['링크 2', '링크 3 고침', '링크 4', '링크 5', '링크 6']);
  await expect(stage.getByText('E2E 설명')).toBeVisible();
  await expect(draftChip).toBeVisible();
  await expect(main.locator('.panel-title-row').getByText('저장 안 함', { exact: true })).toBeVisible();

  // 저장하지 않고 미리보기에서 다른 링크 카드를 고르면 패널이 그 링크 폼으로 바뀌고(초점은 패널 제목), 링크 3 초안은 남음
  await pick('링크 4 링크 편집').click();
  await expect(panelTitle('링크 · 링크 4')).toBeFocused();
  await expect(
    main.getByRole('form', { name: '링크 4 링크 수정', exact: true }).getByLabel('표시 이름 (필수)'),
  ).toHaveValue('링크 4');
  await expect(main.locator('.panel-title-row').getByText('저장 안 함', { exact: true })).toHaveCount(0);
  await expect(previewTitles).toHaveText(['링크 2', '링크 3 고침', '링크 4', '링크 5', '링크 6']);
  await expect(draftChip).toBeVisible();

  // `전체`로 나가면 처음 패널(구역 목록에 저장 안 함)이고, 처음 고른 미리보기 버튼(`외부 링크 구역 편집`)으로 초점이 돌아감
  await back.click();
  await expect(page.getByRole('heading', { name: '페이지 편집', level: 1 })).toBeVisible();
  await expect(pick('외부 링크 구역 편집')).toBeFocused();
  await expect(main.getByRole('button', { name: /외부 링크.*보이는 링크 5\/5.*저장 안 함/ })).toBeVisible();
  await expect(draftChip).toBeVisible();
  await main.getByRole('button', { name: /외부 링크.*보이는 링크 5\/5/ }).click();
  await expect(panelTitle('외부 링크')).toBeFocused();
  const item3Draft = links
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: '링크 3 수정', exact: true }) });
  await expect(item3Draft.getByText('저장 안 함', { exact: true })).toBeVisible();

  // 미리보기에서 초안 이름(링크 3 고침)으로 다시 고르면 남은 초안 그대로. 저장하면 외부 링크 패널로 돌아와 결과 안내
  await pick('링크 3 고침 링크 편집').click();
  await expect(panelTitle('링크 · 링크 3')).toBeFocused();
  await expect(main.locator('.panel-title-row').getByText('저장 안 함', { exact: true })).toBeVisible();
  await expect(editForm.getByLabel('표시 이름 (필수)')).toHaveValue('링크 3 고침');
  await expect(editForm.getByLabel('설명')).toHaveValue('E2E 설명');
  await expect(editForm.getByRole('img', { name: '썸네일 미리보기' })).toBeVisible();
  await editForm.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editForm).toHaveCount(0);
  await expect(panelTitle('외부 링크')).toBeFocused();
  await expect(links.getByText("'링크 3 고침' 링크를 고쳤어요.")).toBeVisible();
  const item3 = links
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: '링크 3 고침 수정', exact: true }) });
  await expect(item3.getByText('E2E 설명')).toBeVisible();
  await expect(item3.locator('img.link-thumb')).toBeVisible();
  await expect(item3.getByText('저장 안 함', { exact: true })).toHaveCount(0);
  await expect(draftChip).toHaveCount(0);
  await expect(titles).toHaveText(['링크 1', '링크 2', '링크 3 고침', '링크 4', '링크 5', '링크 6']);

  // 드래그(마우스): 링크 6을 링크 2 자리로
  await dragWithMouse(
    page,
    links.getByRole('button', { name: '링크 6 순서 바꾸기' }),
    links.getByRole('button', { name: '링크 2 순서 바꾸기' }),
  );
  await expect(links.getByText('순서를 바꿨어요.')).toBeVisible();
  await expect(titles).toHaveText(['링크 1', '링크 6', '링크 2', '링크 3 고침', '링크 4', '링크 5']);

  // 키보드: 손잡이에서 스페이스로 들고 ↑로 옮긴 뒤 스페이스로 놓기. 단계마다 스크린리더 안내(한국어)를 확인합니다.
  const handle4 = links.getByRole('button', { name: '링크 4 순서 바꾸기' });
  const announcement = page.locator('[id^="DndLiveRegion-"]');
  await handle4.focus();
  await page.keyboard.press('Space');
  await expect(handle4).toHaveAttribute('aria-pressed', 'true');
  // 전체 개수에는 맨 뒤의 광고 블록 행도 들어갑니다(링크 6 + 광고 행 1).
  await expect(announcement).toHaveText('링크 4 링크를 들었어요. 지금 5번째, 전체 7개예요.');
  // 들어 올린 직후 dnd-kit이 목록 위치를 재기 전에 누른 화살표는 무시되므로, 안내가 바뀔 때까지 ↑를 다시 누릅니다.
  await expect(async () => {
    await page.keyboard.press('ArrowUp');
    await expect(announcement).toHaveText('링크 4 링크를 4번째 자리로 옮기고 있어요.', { timeout: 1000 });
  }).toPass();
  await page.keyboard.press('Space');
  await expect(announcement).toHaveText('링크 4 링크를 4번째 자리에 놓았어요.');
  await expect(titles).toHaveText(['링크 1', '링크 6', '링크 2', '링크 4', '링크 3 고침', '링크 5']);
  await expect(links.getByText('순서를 바꿨어요.')).toBeVisible();
  // 새로 열면 처음 패널부터. 미리보기 순서도 저장된 순서
  await page.reload();
  await expect(previewTitles).toHaveText(['링크 6', '링크 2', '링크 4', '링크 3 고침', '링크 5']);
  await pick('외부 링크 구역 편집').click();
  await expect(titles).toHaveText(['링크 1', '링크 6', '링크 2', '링크 4', '링크 3 고침', '링크 5']);

  // 링크 폼에서 삭제(확인 창) → 외부 링크 패널로 돌아와 결과 안내
  await links.getByRole('button', { name: '링크 5 수정', exact: true }).click();
  await expect(panelTitle('링크 · 링크 5')).toBeFocused();
  const deleteForm = main.getByRole('form', { name: '링크 5 링크 수정', exact: true });
  page.once('dialog', (dialog) => void dialog.accept());
  await deleteForm.getByRole('button', { name: '삭제' }).click();
  await expect(deleteForm).toHaveCount(0);
  await expect(links.getByText("'링크 5' 링크를 지웠어요.")).toBeVisible();
  await expect(titles).toHaveText(['링크 1', '링크 6', '링크 2', '링크 4', '링크 3 고침']);
  await expect(links.getByText('보이는 링크 4/5')).toBeVisible();
  await expect(pick('+ 링크 추가')).toBeVisible();

  // 미리보기: 방문자 화면과 같은 내용(숨긴 링크 없음, 바꾼 순서). `페이지 편집` 미리보기에는 원래 링크(<a>)가 없고,
  // 링크 카드를 누르면 이동 없이 그 링크를 골라 패널이 바뀜
  const expected = ['링크 6', '링크 2', '링크 4', '링크 3 고침'];
  await expect(previewTitles).toHaveText(expected);
  await expect(stage.getByRole('heading', { name: 'E2E 크리에이터', level: 2 })).toBeVisible();
  await expect(stage.locator('.preview-screen a')).toHaveCount(0);
  const editClicks = await navigationsDuring(page, async () => {
    await pick('링크 6 링크 편집').click();
    await expect(panelTitle('링크 · 링크 6')).toBeFocused();
  });
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  expect(editClicks, '미리보기 링크 카드를 눌러도 이동·새 창 없음').toEqual([]);

  // 다른 메뉴(주소 설정)의 미리보기는 방문자 모습: 링크는 클릭 기록 없는 저장된 주소이고 눌러도 이동하지 않음
  await menu.getByRole('link', { name: '주소 설정' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}/settings`);
  await expect(previewTitles).toHaveText(expected);
  const firstPreviewLink = stage.locator('.preview-screen a.link-card').first();
  await expect(firstPreviewLink).toHaveAttribute('href', /^https:\/\/site-.*\.e2e\.test\/l6$/);
  const plainClicks = await navigationsDuring(page, async () => {
    await firstPreviewLink.click();
    await expect(page).toHaveURL(`${WEB_URL}${managePath}/settings`);
    await expect(previewTitles).toHaveText(expected);
  });
  expect(plainClicks, '미리보기 링크를 눌러도 이동·새 창 없음').toEqual([]);

  // 옛 보기 모드 주소는 `페이지 편집`으로
  await page.goto(`${managePath}?mode=view`);
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  await expect(previewTitles).toHaveText(expected);

  // 1280px·390px 가로 넘침 없음
  await expectNoHorizontalOverflow(page, '페이지 편집 1280px');
  await expectMobileFits(page, '페이지 편집');

  // 390px: 무대 대신 탭 아래 sticky 줄(단축 주소·복사·공개 페이지 열기·`편집 | 미리보기`). 떠 있는 미리보기 버튼·대화상자 없음
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stage).toHaveCount(0);
  await expect(main.locator('code.url-text')).toHaveText(`${shortHost}/${newSlug}`);
  await expect(main.getByRole('button', { name: '내 크리링 링크 복사' })).toBeVisible();
  await expect(main.getByRole('link', { name: '공개 페이지 열기 (새 창)', exact: true })).toHaveAttribute(
    'href',
    creator.landingUrl,
  );
  const viewModes = main.getByRole('group', { name: '미리보기 모드' });
  const editView = viewModes.getByRole('button', { name: '편집', exact: true });
  const previewView = viewModes.getByRole('button', { name: '미리보기', exact: true });
  await expect(editView).toHaveAttribute('aria-pressed', 'true');
  await expect(previewView).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '미리보기', exact: true })).toHaveCount(1);
  // `편집` 화면은 전체 폭 미리보기에 고르기 버튼(편집 칩)
  const narrowTitles = main.locator('.link-title');
  await expect(narrowTitles).toHaveText(expected);
  await expect(main.getByRole('button', { name: '외부 링크 구역 편집', exact: true })).toBeVisible();
  await expect(main.locator('a.link-card')).toHaveCount(0);
  // `미리보기`는 고르기 버튼 없는 방문자 모습
  await previewView.click();
  await expect(previewView).toHaveAttribute('aria-pressed', 'true');
  await expect(editView).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(narrowTitles).toHaveText(expected);
  await expect(main.getByRole('button', { name: '외부 링크 구역 편집' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: '링크 6 링크 편집' })).toHaveCount(0);
  await expect(main.locator('a.link-card')).toHaveCount(4);
  await expectNoHorizontalOverflow(page, '페이지 편집 미리보기 390px');
  await editView.click();
  await expect(editView).toHaveAttribute('aria-pressed', 'true');
  const mobileAdd = main.getByRole('button', { name: '+ 링크 추가', exact: true });
  await expect(mobileAdd).toBeVisible();

  // 390px `+ 링크 추가`는 하단 시트(첫 입력에 초점, `저장`·`취소`): `취소`는 초안을 버리고 외부 링크 시트로, Esc·배경 누르기로 닫히고 연 버튼으로 초점 복귀
  await mobileAdd.click();
  const mobileSheet = page.getByRole('dialog', { name: '새 링크', exact: true });
  await expect(mobileSheet.getByLabel('표시 이름 (필수)')).toBeFocused();
  await expect(mobileSheet.getByRole('button', { name: '저장', exact: true })).toBeVisible();
  await mobileSheet.getByLabel('표시 이름 (필수)').fill('버릴 초안');
  await expect(page.locator('.preview-screen .link-title', { hasText: '버릴 초안' })).toHaveCount(1);
  await mobileSheet.getByRole('button', { name: '취소' }).click();
  await expect(page.getByRole('dialog', { name: '외부 링크', exact: true })).toBeVisible();
  await expect(page.locator('.preview-screen .link-title', { hasText: '버릴 초안' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(mobileAdd).toBeFocused();
  await mobileAdd.click();
  await expect(mobileSheet).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(mobileAdd).toBeFocused();

  // 열린 시트는 화면 아래에 붙고 가로로 넘치지 않음
  await mobileAdd.click();
  await expect(mobileSheet).toBeVisible();
  const sheetBox = await mobileSheet.boundingBox();
  expect(sheetBox && Math.round(sheetBox.x + sheetBox.width), '시트 오른쪽 끝').toBeLessThanOrEqual(390);
  expect(sheetBox && Math.round(sheetBox.y + sheetBox.height), '시트 아래 끝').toBe(844);
  expect(
    await mobileSheet.evaluate((element) => element.scrollWidth - element.clientWidth),
    '시트 안 가로 넘침(px)',
  ).toBeLessThanOrEqual(0);
  await expectNoHorizontalOverflow(page, '페이지 편집 시트 390px');
  await mobileSheet.getByRole('button', { name: '닫기' }).click();
  await expect(mobileSheet).toHaveCount(0);
  await expect(mobileAdd).toBeFocused();

  // 390px 링크 카드 고르기 → 시트로 수정·저장(`취소` 없이 저장·삭제). 저장하면 시트가 외부 링크 목록과 결과 안내로 바뀌고,
  // 닫으면 고른 링크 카드로 초점 복귀
  const mobilePick = main.getByRole('button', { name: '링크 4 링크 편집', exact: true });
  await mobilePick.click();
  const editSheet = page.getByRole('dialog', { name: '링크 · 링크 4', exact: true });
  await expect(editSheet.getByLabel('표시 이름 (필수)')).toBeFocused();
  await expect(editSheet.getByLabel('표시 이름 (필수)')).toHaveValue('링크 4');
  await expect(editSheet.getByRole('button', { name: '취소' })).toBeVisible();
  await expect(editSheet.getByRole('button', { name: '삭제' })).toBeVisible();
  await editSheet.getByLabel('설명').fill('모바일 설명');
  await expect(editSheet.getByText('저장 안 함', { exact: true })).toBeVisible();
  await editSheet.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editSheet).toHaveCount(0);
  const linksSheet = page.getByRole('dialog', { name: '외부 링크', exact: true });
  await expect(linksSheet.getByText("'링크 4' 링크를 고쳤어요.")).toBeVisible();
  await linksSheet.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(mobilePick).toBeFocused();

  // 390px 다른 메뉴의 `편집` 화면은 패널 내용(프로필 폼)
  await menu.getByRole('link', { name: '프로필' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}/profile`);
  await expect(main.getByRole('region', { name: '프로필', exact: true }).getByLabel('이름(닉네임)')).toHaveValue(
    'E2E 크리에이터',
  );
  await expect(main.getByRole('button', { name: '프로필 편집' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, '프로필 390px');
  await page.setViewportSize({ width: 1280, height: 800 });

  // 남의 랜딩 ID는 찾을 수 없음 안내, 로그인하지 않았으면 홈으로
  const other = await data.user();
  await page.goto(`/me/landings/${other.publicId}`);
  await expect(page.getByRole('heading', { name: '랜딩페이지를 찾을 수 없어요.' })).toBeVisible();
  await expect(page.getByRole('link', { name: '내 크리링으로' })).toHaveAttribute('href', '/me');
  await expect(page.getByRole('region', { name: '미리보기' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '관리 메뉴' })).toHaveCount(0);
  const signedOut = await data.session();
  await signedOut.page.goto(managePath);
  await expect(signedOut.page).toHaveURL(`${WEB_URL}/`);
  await signedOut.page.goto('/me');
  await expect(signedOut.page).toHaveURL(`${WEB_URL}/`);

  // 공개 랜딩에 미리보기와 같은 내용(숨긴 링크 제외, 바꾼 순서) 반영
  await page.goto(creator.landingUrl);
  await expect(page.getByRole('heading', { name: 'E2E 크리에이터', level: 1 })).toBeVisible();
  await expect(page.getByText('E2E 소개 문구입니다.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'E2E 크리에이터 프로필 사진' })).toBeVisible();
  await expect(page.locator('.profile-head .default-avatar')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'SNS 채널' }).getByRole('link', { name: '유튜브' })).toHaveAttribute(
    'href',
    socialUrl,
  );
  await expect(page.locator('.link-title')).toHaveText(expected);
  await expect(page.getByText('E2E 설명')).toBeVisible();
  await expect(page.getByText('모바일 설명')).toBeVisible();
  await expect(page.getByRole('region', { name: '포트폴리오' }).getByText('E2E 협업')).toBeVisible();
  await expectMobileFits(page, '/p/{publicId}');
});

test('크리에이터: 모바일 터치로 링크를 끌어 순서 변경(390px 외부 링크 시트)', async ({ data }) => {
  const creator = await data.user({
    links: [
      { title: '첫째', url: data.externalUrl('a') },
      { title: '둘째', url: data.externalUrl('b') },
      { title: '셋째', url: data.externalUrl('c') },
    ],
  });
  const { context, page } = await data.session(creator, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(`/me/landings/${creator.publicId}`);
  // 390px은 `편집` 화면의 미리보기에서 외부 링크 구역을 고르면 외부 링크 목록이 하단 시트로 열림
  const openLinks = page.getByRole('main').getByRole('button', { name: '외부 링크 구역 편집', exact: true });
  const links = page.getByRole('dialog', { name: '외부 링크', exact: true });
  const titles = links.locator('.link-edit-card:not(.slot-edit-card) .link-title');
  await openLinks.click();
  await expect(titles).toHaveText(['첫째', '둘째', '셋째']);

  // Playwright에는 터치 끌기 API가 없어 CDP 터치 이벤트(브라우저가 pointer 이벤트로 바꿈)로 손잡이를 끕니다.
  // 터치 좌표는 화면 기준이므로 먼저 손잡이를 화면 안으로 스크롤합니다.
  const handle = links.getByRole('button', { name: '셋째 순서 바꾸기' });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  // 좁은 화면은 스위치·수정 버튼이 둘째 줄로 내려갈 수 있으므로 같은 줄에 있는 대상 손잡이 위치로 끕니다.
  const to = await links.getByRole('button', { name: '첫째 순서 바꾸기' }).boundingBox();
  if (!from || !to) throw new Error('끌기 대상 위치를 찾지 못했어요.');
  const cdp = await context.newCDPSession(page);
  const x = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  for (let step = 1; step <= 20; step += 1) {
    const y = startY + ((endY - startY) * step) / 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(links.getByText('순서를 바꿨어요.')).toBeVisible();
  await expect(titles).toHaveText(['셋째', '첫째', '둘째']);
  await expectNoHorizontalOverflow(page, '외부 링크 시트 모바일 터치 390px');
  await page.reload();
  await expect(page.getByRole('main').locator('.link-title')).toHaveText(['셋째', '첫째', '둘째']);
  await openLinks.click();
  await expect(titles).toHaveText(['셋째', '첫째', '둘째']);
  await expectNoHorizontalOverflow(page, '페이지 편집 모바일 터치 390px');
});
