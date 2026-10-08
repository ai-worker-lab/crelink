// 검증 계획 E2E 1: 크리에이터 편집 흐름. 기준: docs/specs/crelink-mvp.md#검증-계획, 관리 화면 `/me/landings/{publicId}`(PRD R18).
import type { Locator, Page } from '@playwright/test';
import { expect, expectMobileFits, expectNoHorizontalOverflow, SHORT_URL, test, TINY_PNG, WEB_URL } from './fixtures';

/** 넓은 화면(1280px) `페이지 편집`에서 패널 안 펼침 폼으로 링크를 하나 추가합니다. */
async function addLink(links: Locator, title: string, url: string) {
  await links.getByRole('button', { name: '링크 추가' }).click();
  const form = links.getByRole('form', { name: '새 링크' });
  await expect(form.getByLabel('표시 이름 (필수)')).toBeFocused();
  await form.getByLabel('표시 이름 (필수)').fill(title);
  await form.getByLabel('주소 (필수)').fill(url);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0);
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

test('크리에이터: /me 이동, 프로필·SNS·포트폴리오와 실시간 미리보기, 주소 설정(복사·30일 제한), 외부 링크(펼침 폼·한도·숨기기·드래그·삭제), 390px 미리보기·하단 시트', async ({
  data,
}) => {
  const creator = await data.user();
  const { context, page } = await data.session(creator);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });
  const managePath = `/me/landings/${creator.publicId}`;
  // 편집 패널은 main, 미리보기는 그 옆 complementary. 같은 이름(포트폴리오 등)이 둘 다에 있어 범위를 나눠 찾습니다.
  const main = page.getByRole('main');
  const preview = page.getByRole('complementary', { name: '미리보기' });
  const draftChip = preview.getByText('저장하지 않은 변경 포함');
  const previewTitles = preview.locator('.link-title');
  const menu = page.getByRole('navigation', { name: '관리 메뉴' });
  const summary = main.getByRole('region', { name: '내 페이지' });

  // /me는 내 랜딩 관리 화면의 `페이지 편집`으로 307 이동
  const me = await page.request.get(`${WEB_URL}/me`, { maxRedirects: 0 });
  expect(me.status(), '/me 이동').toBe(307);
  expect(new URL(me.headers().location, WEB_URL).pathname).toBe(managePath);
  await page.goto('/me');
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  await expect(page.getByRole('heading', { name: '페이지 편집', level: 1 })).toBeAttached();
  await expect(menu.getByRole('link', { name: '페이지 편집' })).toHaveAttribute('aria-current', 'page');
  const header = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(header.getByRole('link', { name: '공개 페이지 열기 (새 창)' })).toHaveAttribute(
    'href',
    creator.landingUrl,
  );
  await expect(header.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(header.getByRole('link', { name: '운영자 화면' })).toHaveCount(0);
  await expect(summary.locator('.summary-name')).toHaveText('이름 없음');
  // 머리 카드는 단축 주소를 `http(s)://` 없이 보여 줍니다.
  await expect(summary.locator('code.url-text')).toHaveText(`${new URL(SHORT_URL).host}/${creator.slug}`);
  await expect(preview.getByText('아직 준비 중인 페이지예요.')).toBeVisible();

  // 프로필: 사진(작은 PNG)·이름·소개. 저장 전 입력이 미리보기에 바로 보이고 카드·미리보기에 저장 안 함 표시
  const profile = main.getByRole('region', { name: '프로필' });
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
  await expect(preview.getByRole('heading', { name: 'E2E 크리에이터', level: 2 })).toBeVisible();
  await expect(preview.getByText('E2E 소개 문구입니다.')).toBeVisible();
  await expect(preview.getByRole('img', { name: 'E2E 크리에이터 프로필 사진' })).toBeVisible();
  await expect(summary.locator('.summary-name')).toHaveText('이름 없음');
  await profile.getByRole('button', { name: '프로필 저장' }).click();
  await expect(profile.getByText('프로필을 저장했어요.')).toBeVisible();
  await expect(profile.getByText('저장 안 함', { exact: true })).toHaveCount(0);
  await expect(draftChip).toHaveCount(0);
  await expect(summary.locator('.summary-name')).toHaveText('E2E 크리에이터');

  // SNS: 저장 전 미리보기에 아이콘
  const socials = main.getByRole('region', { name: 'SNS 채널' });
  await socials.getByRole('button', { name: 'SNS 채널 추가' }).click();
  await socials.getByLabel('플랫폼 1').selectOption('youtube');
  const socialUrl = data.externalUrl('@e2e');
  await socials.getByLabel('계정 주소 1').fill(socialUrl);
  await expect(preview.getByRole('list', { name: 'SNS 채널' }).getByRole('link', { name: '유튜브' })).toHaveAttribute(
    'href',
    socialUrl,
  );
  await socials.getByRole('button', { name: 'SNS 채널 저장' }).click();
  await expect(socials.getByText('SNS 채널을 저장했어요.')).toBeVisible();

  // 포트폴리오: 넓은 화면은 패널 안 펼침 폼, 저장 전 미리보기에 항목
  const portfolio = main.getByRole('region', { name: '포트폴리오' });
  await portfolio.getByRole('button', { name: '포트폴리오 추가' }).click();
  const portfolioForm = portfolio.getByRole('form', { name: '새 포트폴리오 항목' });
  await expect(portfolioForm.getByLabel('제목 (필수)')).toBeFocused();
  await portfolioForm.getByLabel('제목 (필수)').fill('E2E 협업');
  await portfolioForm.getByLabel('링크', { exact: true }).fill(data.externalUrl('work'));
  await portfolioForm.getByLabel('설명').fill('브랜드 협업 이력');
  await expect(portfolio.getByText('저장 안 함', { exact: true })).toBeVisible();
  await expect(preview.getByRole('region', { name: '포트폴리오' }).getByText('E2E 협업')).toBeVisible();
  await portfolioForm.getByRole('button', { name: '저장', exact: true }).click();
  await expect(portfolio.getByText('포트폴리오 항목을 추가했어요.')).toBeVisible();
  await expect(portfolioForm).toHaveCount(0);
  await expect(portfolio.locator('.item-title')).toHaveText(['E2E 협업']);

  // 머리 카드 `주소 변경` → `주소 설정` 메뉴, 새 주소 입력에 초점. 계정 이메일
  await summary.getByRole('link', { name: '주소 변경' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}/settings`);
  await expect(menu.getByRole('link', { name: '주소 설정' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: '주소 설정', level: 1 })).toBeAttached();
  const slugCard = main.getByRole('region', { name: '주소 바꾸기' });
  await expect(slugCard.getByLabel('새 주소')).toBeFocused();
  await expect(main.getByRole('region', { name: '계정' }).getByText(creator.email)).toBeVisible();

  // 단축 URL 표시·복사
  const short = main.getByRole('region', { name: '내 크리링 링크' });
  await expect(short.locator('code.url-text')).toHaveText(creator.shortUrl);
  await short.getByRole('button', { name: '내 크리링 링크 복사' }).click();
  await expect(short.getByText('복사했어요.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(creator.shortUrl);

  // 주소 변경: 자동 주소는 바로 바꿀 수 있음. 바꾸면 머리 카드 주소도 바뀜
  const newSlug = data.unique('e2e-me');
  await expect(slugCard.getByText('자동 발급 주소는 지금 바로 바꿀 수 있어요.', { exact: false })).toBeVisible();
  await slugCard.getByLabel('새 주소').fill(newSlug);
  await expect(slugCard.getByText('사용할 수 있는 주소예요.')).toBeVisible();
  await slugCard.getByRole('button', { name: '주소 바꾸기' }).click();
  await expect(slugCard.getByText('주소를 바꿨어요.', { exact: false })).toBeVisible();
  await expect(short.locator('code.url-text')).toHaveText(`${SHORT_URL}/${newSlug}`);
  await expect(summary.locator('code.url-text')).toHaveText(`${new URL(SHORT_URL).host}/${newSlug}`);

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

  // `페이지 편집`으로 돌아와 외부 링크 관리
  await menu.getByRole('link', { name: '페이지 편집' }).click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  const links = main.getByRole('region', { name: '외부 링크' });
  const titles = links.locator('.link-edit-card .link-title');
  await expect(links.getByText('아직 추가한 링크가 없어요.', { exact: false })).toBeVisible();
  await expect(links.getByText('보이는 링크 0/5')).toBeVisible();

  // 넓은 화면의 링크 추가는 대화상자가 아니라 패널 안 펼침 폼. 저장 전 입력이 미리보기 끝에 붙고, Esc로 취소하면 사라지고 연 버튼으로 초점 복귀
  const addButton = links.getByRole('button', { name: '링크 추가' });
  await addButton.click();
  const draftForm = links.getByRole('form', { name: '새 링크' });
  await expect(draftForm.getByLabel('표시 이름 (필수)')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await draftForm.getByLabel('표시 이름 (필수)').fill('초안 링크');
  await expect(previewTitles).toHaveText(['초안 링크']);
  await expect(draftChip).toBeVisible();
  await expect(links.getByText('저장 안 함', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(draftForm).toHaveCount(0);
  await expect(addButton).toBeFocused();
  await expect(previewTitles).toHaveCount(0);
  await expect(draftChip).toHaveCount(0);

  // 링크 5개 → 한도 안내, 추가 버튼 없음, API도 409
  for (let index = 1; index <= 5; index += 1) await addLink(links, `링크 ${index}`, data.externalUrl(`l${index}`));
  await expect(links.getByText('보이는 링크 5/5')).toBeVisible();
  await expect(links.getByText('보이는 링크 한도(5개)에 도달했어요.', { exact: false })).toBeVisible();
  await expect(links.getByRole('button', { name: '링크 추가' })).toHaveCount(0);
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
  await addLink(links, '링크 6', data.externalUrl('l6'));
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

  // 펼침 폼으로 수정: 표시 이름·설명·썸네일. 저장 전 미리보기 제자리에 고친 내용
  await links.getByRole('button', { name: '링크 3 수정', exact: true }).click();
  await expect(links.getByRole('button', { name: '링크 3 접기', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const editForm = links.getByRole('form', { name: '링크 수정' });
  await expect(editForm.getByLabel('표시 이름 (필수)')).toBeFocused();
  await expect(editForm.getByLabel('표시 이름 (필수)')).toHaveValue('링크 3');
  await editForm.getByLabel('표시 이름 (필수)').fill('링크 3 고침');
  await editForm.getByLabel('설명').fill('E2E 설명');
  await editForm.getByLabel('썸네일').setInputFiles({ name: 'thumb.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(editForm.getByRole('img', { name: '썸네일 미리보기' })).toBeVisible();
  await expect(previewTitles).toHaveText(['링크 2', '링크 3 고침', '링크 4', '링크 5', '링크 6']);
  await expect(preview.getByText('E2E 설명')).toBeVisible();
  await expect(draftChip).toBeVisible();
  await editForm.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editForm).toHaveCount(0);
  await expect(links.getByText("'링크 3 고침' 링크를 고쳤어요.")).toBeVisible();
  const edited = links.getByRole('button', { name: '링크 3 고침 수정', exact: true });
  await expect(edited).toBeFocused();
  await expect(edited).toHaveAttribute('aria-expanded', 'false');
  const item3 = links
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: '링크 3 고침 수정', exact: true }) });
  await expect(item3.getByText('E2E 설명')).toBeVisible();
  await expect(item3.locator('img.link-thumb')).toBeVisible();
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
  await expect(announcement).toHaveText('링크 4 링크를 들었어요. 지금 5번째, 전체 6개예요.');
  // 들어 올린 직후 dnd-kit이 목록 위치를 재기 전에 누른 화살표는 무시되므로, 안내가 바뀔 때까지 ↑를 다시 누릅니다.
  await expect(async () => {
    await page.keyboard.press('ArrowUp');
    await expect(announcement).toHaveText('링크 4 링크를 4번째 자리로 옮기고 있어요.', { timeout: 1000 });
  }).toPass();
  await page.keyboard.press('Space');
  await expect(announcement).toHaveText('링크 4 링크를 4번째 자리에 놓았어요.');
  await expect(titles).toHaveText(['링크 1', '링크 6', '링크 2', '링크 4', '링크 3 고침', '링크 5']);
  await expect(links.getByText('순서를 바꿨어요.')).toBeVisible();
  await page.reload();
  await expect(titles).toHaveText(['링크 1', '링크 6', '링크 2', '링크 4', '링크 3 고침', '링크 5']);

  // 펼침 폼에서 삭제(확인 창)
  await links.getByRole('button', { name: '링크 5 수정', exact: true }).click();
  const deleteForm = links.getByRole('form', { name: '링크 수정' });
  page.once('dialog', (dialog) => void dialog.accept());
  await deleteForm.getByRole('button', { name: '삭제' }).click();
  await expect(deleteForm).toHaveCount(0);
  await expect(links.getByText("'링크 5' 링크를 지웠어요.")).toBeVisible();
  await expect(titles).toHaveText(['링크 1', '링크 6', '링크 2', '링크 4', '링크 3 고침']);
  await expect(links.getByText('보이는 링크 4/5')).toBeVisible();

  // 미리보기: 방문자 화면과 같은 내용(숨긴 링크 없음, 바꾼 순서), 링크는 클릭 기록 없는 저장된 주소이고 눌러도 이동하지 않음
  const expected = ['링크 6', '링크 2', '링크 4', '링크 3 고침'];
  await expect(previewTitles).toHaveText(expected);
  await expect(preview.getByRole('heading', { name: 'E2E 크리에이터', level: 2 })).toBeVisible();
  const firstPreviewLink = preview.locator('.link-card').first();
  await expect(firstPreviewLink).toHaveAttribute('href', /^https:\/\/site-.*\.e2e\.test\/l6$/);
  const navigations: string[] = [];
  const onRequest = (request: { url(): string; isNavigationRequest(): boolean }) => {
    if (request.isNavigationRequest()) navigations.push(request.url());
  };
  const onPage = (opened: Page) => navigations.push(opened.url());
  page.on('request', onRequest);
  context.on('page', onPage);
  await firstPreviewLink.click();
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  await expect(previewTitles).toHaveText(expected);
  page.off('request', onRequest);
  context.off('page', onPage);
  expect(navigations, '미리보기 링크를 눌러도 이동·새 창 없음').toEqual([]);

  // 옛 보기 모드 주소는 `페이지 편집`으로
  await page.goto(`${managePath}?mode=view`);
  await expect(page).toHaveURL(`${WEB_URL}${managePath}`);
  await expect(previewTitles).toHaveText(expected);

  // 1280px·390px 가로 넘침 없음. 390px은 미리보기 열 대신 `미리보기` 버튼 → 전체 화면 대화상자
  await expectNoHorizontalOverflow(page, '페이지 편집 1280px');
  await expectMobileFits(page, '페이지 편집');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toHaveCount(0);
  const previewButton = page.getByRole('button', { name: '미리보기', exact: true });
  await previewButton.click();
  const previewDialog = page.getByRole('dialog', { name: '미리보기' });
  await expect(previewDialog.locator('.link-title')).toHaveText(expected);
  await expectNoHorizontalOverflow(page, '미리보기 대화상자 390px');
  await previewDialog.getByRole('button', { name: '닫기' }).click();
  await expect(previewDialog).toHaveCount(0);
  await expect(previewButton).toBeFocused();

  // 390px 링크 추가는 하단 시트: Esc·배경 누르기로 닫히고 연 버튼으로 포커스가 돌아감
  const mobileAdd = links.getByRole('button', { name: '링크 추가' });
  await mobileAdd.click();
  const mobileSheet = page.getByRole('dialog', { name: '새 링크' });
  await expect(mobileSheet.getByLabel('표시 이름 (필수)')).toBeFocused();
  await expect(links.getByRole('form', { name: '새 링크' })).toHaveCount(0);
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

  // 390px 시트로 수정·저장
  await links.getByRole('button', { name: '링크 4 수정', exact: true }).click();
  const editSheet = page.getByRole('dialog', { name: '링크 수정' });
  await expect(editSheet.getByLabel('표시 이름 (필수)')).toBeFocused();
  await expect(editSheet.getByLabel('표시 이름 (필수)')).toHaveValue('링크 4');
  await editSheet.getByLabel('설명').fill('모바일 설명');
  await editSheet.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editSheet).toHaveCount(0);
  await expect(links.getByText("'링크 4' 링크를 고쳤어요.")).toBeVisible();
  await expect(links.getByRole('button', { name: '링크 4 수정', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 });

  // 남의 랜딩 ID는 찾을 수 없음 안내, 로그인하지 않았으면 홈으로
  const other = await data.user();
  await page.goto(`/me/landings/${other.publicId}`);
  await expect(page.getByRole('heading', { name: '랜딩페이지를 찾을 수 없어요.' })).toBeVisible();
  await expect(page.getByRole('link', { name: '내 크리링으로' })).toHaveAttribute('href', '/me');
  await expect(page.getByRole('region', { name: '외부 링크' })).toHaveCount(0);
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

test('크리에이터: 모바일 터치로 링크를 끌어 순서 변경(390px)', async ({ data }) => {
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
  const links = page.getByRole('region', { name: '외부 링크' });
  const titles = links.locator('.link-edit-card .link-title');
  await expect(titles).toHaveText(['첫째', '둘째', '셋째']);

  // Playwright에는 터치 끌기 API가 없어 CDP 터치 이벤트(브라우저가 pointer 이벤트로 바꿈)로 손잡이를 끕니다.
  // 터치 좌표는 화면 기준이고 링크 카드는 프로필·SNS 카드 아래에 있으므로 먼저 손잡이를 화면 안으로 스크롤합니다.
  const handle = links.getByRole('button', { name: '셋째 순서 바꾸기' });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  // 좁은 화면은 스위치·수정 버튼이 둘째 줄로 내려가므로 같은 줄에 있는 대상 손잡이 위치로 끕니다.
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
  await page.reload();
  await expect(titles).toHaveText(['셋째', '첫째', '둘째']);
  await expectNoHorizontalOverflow(page, '페이지 편집 모바일 터치 390px');
});
