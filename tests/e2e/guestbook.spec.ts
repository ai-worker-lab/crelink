// 방명록 탭(PRD R19) E2E. 기준: docs/specs/crelink-guestbook.md#검증-계획
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, expectMobileFits, test, WEB_URL } from './fixtures';

/**
 * 랜딩 주소에 `#guestbook`을 붙여 새 문서로 엽니다. 외부 진입이라 단축 주소를 거쳐 돌아오고, 해시는 리디렉트를 지나도 남습니다.
 * 이미 같은 랜딩을 보고 있으면 해시만 바뀌는 문서 안 이동이 되어 목록을 다시 받지 않으므로 빈 문서를 먼저 엽니다.
 */
async function openGuestbook(page: Page, landingUrl: string) {
  await page.goto('about:blank');
  await page.goto(`${landingUrl}#guestbook`);
  await expect(page).toHaveURL(`${landingUrl}#guestbook`);
  await expect(page.getByRole('tab', { name: '방명록' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('방명록을 불러오는 중…')).toHaveCount(0);
}

async function writeEntry(page: Page, body: string, secret: boolean) {
  const form = page.getByRole('form', { name: '방명록 남기기' });
  await form.getByLabel('방명록 글').fill(body);
  if (secret) await form.getByLabel('비밀글').check();
  await form.getByRole('button', { name: '남기기' }).click();
  await expect(page.getByText(secret ? '비밀글을 남겼어요.' : '방명록을 남겼어요.')).toBeVisible();
  await expect(form.getByLabel('방명록 글')).toHaveValue('');
}

const list = (page: Page) => page.getByRole('list', { name: '방명록 글 목록' });
const bodies = (page: Page) => list(page).locator('.guestbook-body');

/** BFF를 거친 방명록 API 응답 원문. 비밀글·숨긴 글이 화면뿐 아니라 응답 어디에도 없는지 봅니다. */
async function guestbookJson(request: APIRequestContext, publicId: string) {
  const response = await request.get(`${WEB_URL}/api/backend/api/landings/${publicId}/guestbook`);
  return { status: response.status(), text: await response.text() };
}

test('방명록: 비회원 읽기·로그인 안내, 공개글·비밀글 가시성, 크리에이터 숨김, 작성자 삭제, 끄기·켜기, 390px', async ({
  data,
}) => {
  const creator = await data.user({ displayName: 'E2E 방명록 주인' });
  const writer = await data.user({ displayName: 'E2E 작성자' });
  const other = await data.user();
  const guest = await data.session();
  const owner = await data.session(creator);
  const author = await data.session(writer);
  const stranger = await data.session(other);
  const publicBody = `공개 방명록 ${data.run}`;
  const secretBody = `비밀 방명록 ${data.run}`;

  // 1. 비회원: 외부에서 #guestbook으로 들어와도 단축 주소를 거쳐 방명록 탭, 빈 상태와 로그인 안내(돌아올 주소 포함)
  await openGuestbook(guest.page, creator.landingUrl);
  await expect(guest.page.getByText('아직 방명록이 없어요. 첫 방명록을 남겨 주세요.')).toBeVisible();
  await expect(guest.page.getByRole('form', { name: '방명록 남기기' })).toHaveCount(0);
  await expect(guest.page.getByRole('link', { name: '로그인하고 남기기' })).toHaveAttribute(
    'href',
    `/auth/google?returnTo=${encodeURIComponent(`/p/${creator.publicId}#guestbook`)}`,
  );
  await guest.page.getByRole('tab', { name: '링크' }).click();
  await expect(guest.page).toHaveURL(creator.landingUrl);

  // 2. 회원이 공개글·비밀글을 남기면 목록 맨 위에 쌓이고, 작성자는 작성자 랜딩의 표시 이름으로 보임
  await openGuestbook(author.page, creator.landingUrl);
  await writeEntry(author.page, publicBody, false);
  await writeEntry(author.page, secretBody, true);
  await expect(bodies(author.page)).toHaveText([secretBody, publicBody]);
  await expect(list(author.page).getByText('E2E 작성자')).toHaveCount(2);
  await expect(list(author.page).getByText('비밀글', { exact: true })).toHaveCount(1);
  await expect(list(author.page).getByRole('button', { name: '삭제' })).toHaveCount(2);
  await expect(list(author.page).getByRole('button', { name: '숨기기' })).toHaveCount(0);

  // 3. 비회원·다른 회원: 공개글만, 버튼 없음, 비밀글은 API 응답에도 없음
  for (const viewer of [guest, stranger]) {
    await openGuestbook(viewer.page, creator.landingUrl);
    await expect(bodies(viewer.page)).toHaveText([publicBody]);
    await expect(list(viewer.page).getByRole('button')).toHaveCount(0);
    const json = await guestbookJson(viewer.context.request, creator.publicId);
    expect(json.status).toBe(200);
    expect(json.text).toContain(publicBody);
    expect(json.text).not.toContain(secretBody);
  }
  await expect(stranger.page.getByRole('form', { name: '방명록 남기기' })).toBeVisible();

  // 4. 크리에이터: 관리 화면 `방명록` 메뉴에서 둘 다(비밀글 표시) 보고 공개글을 숨김
  //    → 미리보기(방문자 시점)·비회원·다른 회원에게서 사라지고, 작성자에게는 숨김 표시 없이 그대로
  const managePath = `/me/landings/${creator.publicId}`;
  const managerMenu = owner.page.getByRole('navigation', { name: '관리 메뉴' });
  const manage = owner.page.getByRole('main');
  const manageList = manage.getByRole('list', { name: '방명록 글 목록' });
  const preview = owner.page.getByRole('complementary', { name: '미리보기' });
  const previewBodies = preview.locator('.guestbook-body');
  await owner.page.goto(`${managePath}/guestbook`);
  await expect(managerMenu.getByRole('link', { name: '방명록' })).toHaveAttribute('aria-current', 'page');
  await expect(manageList.locator('.guestbook-body')).toHaveText([secretBody, publicBody]);
  await expect(manageList.getByText('비밀글', { exact: true })).toHaveCount(1);
  await expect(manageList.getByRole('button', { name: '삭제' })).toHaveCount(0);
  await expect(manage.getByRole('form', { name: '방명록 남기기' })).toHaveCount(0);
  // 미리보기는 방명록 탭이 열리고 방문자 시점: 비밀글·글별 버튼 없음, 로그인 안내는 누를 수 없음, 관리 화면 주소는 그대로
  await expect(preview.getByRole('tab', { name: '방명록' })).toHaveAttribute('aria-selected', 'true');
  await expect(previewBodies).toHaveText([publicBody]);
  await expect(preview.getByRole('list', { name: '방명록 글 목록' }).getByRole('button')).toHaveCount(0);
  await expect(preview.getByRole('button', { name: '로그인하고 남기기' })).toBeDisabled();
  await expect(owner.page).toHaveURL(`${WEB_URL}${managePath}/guestbook`);
  const ownerPublic = manageList.getByRole('listitem').filter({ hasText: publicBody });
  await ownerPublic.getByRole('button', { name: '숨기기' }).click();
  await expect(manage.getByText('글을 숨겼어요. 작성자와 나만 볼 수 있어요.')).toBeVisible();
  await expect(ownerPublic).toHaveClass(/is-hidden/);
  await expect(ownerPublic.getByText('숨김', { exact: true })).toBeVisible();
  await expect(previewBodies).toHaveCount(0);
  await expect(preview.getByText('아직 방명록이 없어요. 첫 방명록을 남겨 주세요.')).toBeVisible();

  for (const viewer of [guest, stranger]) {
    await openGuestbook(viewer.page, creator.landingUrl);
    await expect(viewer.page.getByText('아직 방명록이 없어요. 첫 방명록을 남겨 주세요.')).toBeVisible();
    const json = await guestbookJson(viewer.context.request, creator.publicId);
    expect(json.text).not.toContain(publicBody);
    expect(json.text).not.toContain(secretBody);
  }
  await openGuestbook(author.page, creator.landingUrl);
  await expect(bodies(author.page)).toHaveText([secretBody, publicBody]);
  const authorPublic = list(author.page).getByRole('listitem').filter({ hasText: publicBody });
  await expect(authorPublic).not.toHaveClass(/is-hidden/);
  await expect(authorPublic.getByText('숨김', { exact: true })).toHaveCount(0);
  expect((await guestbookJson(author.context.request, creator.publicId)).text).not.toContain('"hidden":true');

  // 숨김 해제 → 미리보기와 모두에게 다시 보임
  await ownerPublic.getByRole('button', { name: '숨김 해제' }).click();
  await expect(manage.getByText('숨김을 풀었어요.')).toBeVisible();
  await expect(ownerPublic).not.toHaveClass(/is-hidden/);
  await expect(previewBodies).toHaveText([publicBody]);
  await openGuestbook(guest.page, creator.landingUrl);
  await expect(bodies(guest.page)).toHaveText([publicBody]);

  // 5. 작성자가 자기 공개글을 지우면 모두에게서 사라짐
  author.page.once('dialog', (dialog) => void dialog.accept());
  await authorPublic.getByRole('button', { name: '삭제' }).click();
  await expect(author.page.getByText('방명록 글을 지웠어요.')).toBeVisible();
  await expect(bodies(author.page)).toHaveText([secretBody]);
  await openGuestbook(guest.page, creator.landingUrl);
  await expect(guest.page.getByText('아직 방명록이 없어요. 첫 방명록을 남겨 주세요.')).toBeVisible();

  // 6. 크리에이터가 `방명록` 메뉴에서 끄면 꺼짐 안내, 미리보기·공개 랜딩에 탭이 없고 API는 guestbook_disabled.
  //    `페이지 편집`의 같은 스위치로 다시 켜면 남은 글이 보임
  await owner.page.reload();
  const toggle = manage.getByRole('switch', { name: '방명록 켜기' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(manageList.locator('.guestbook-body')).toHaveText([secretBody]);
  await toggle.click();
  await expect(manage.getByText('방명록을 껐어요. 남은 글은 지우지 않고 보관해요.')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(manage.getByText('방명록이 꺼져 있어요. 켜면 이전 글이 그대로 다시 보여요.')).toBeVisible();
  await expect(manageList).toHaveCount(0);
  await expect(preview.getByRole('tab')).toHaveCount(0);
  await guest.page.goto(creator.landingUrl);
  await expect(guest.page.getByRole('heading', { name: 'E2E 방명록 주인', level: 1 })).toBeVisible();
  await expect(guest.page.getByRole('tab')).toHaveCount(0);
  const disabled = await guestbookJson(guest.context.request, creator.publicId);
  expect(disabled.status).toBe(404);
  expect(JSON.parse(disabled.text).code).toBe('guestbook_disabled');

  await managerMenu.getByRole('link', { name: '페이지 편집' }).click();
  await expect(owner.page).toHaveURL(`${WEB_URL}${managePath}`);
  const editToggle = manage.getByRole('region', { name: '방명록' }).getByRole('switch', { name: '방명록 켜기' });
  await expect(editToggle).toHaveAttribute('aria-checked', 'false');
  await editToggle.click();
  await expect(manage.getByText('방명록을 켰어요. 방문자에게 방명록 탭이 보여요.')).toBeVisible();
  await expect(editToggle).toHaveAttribute('aria-checked', 'true');
  await expect(preview.getByRole('tab', { name: '링크' })).toHaveAttribute('aria-selected', 'true');
  await manage.getByRole('link', { name: '방명록 글 관리' }).click();
  await expect(owner.page).toHaveURL(`${WEB_URL}${managePath}/guestbook`);
  await expect(manageList.locator('.guestbook-body')).toHaveText([secretBody]);
  await expect(preview.getByRole('tab', { name: '방명록' })).toHaveAttribute('aria-selected', 'true');
  await expect(preview.getByText('아직 방명록이 없어요. 첫 방명록을 남겨 주세요.')).toBeVisible();
  await expectMobileFits(owner.page, '관리 화면 방명록');
  await openGuestbook(author.page, creator.landingUrl);
  await expect(bodies(author.page)).toHaveText([secretBody]);

  // 7. 이름 없는 작성자는 '크리링 회원', 띄어쓰기 없는 긴 글도 390px에서 가로로 넘치지 않음
  const longBody = `${'가'.repeat(120)}${'a'.repeat(200)}`;
  await openGuestbook(stranger.page, creator.landingUrl);
  await writeEntry(stranger.page, longBody, false);
  await expect(list(stranger.page).getByRole('listitem').first().getByText('크리링 회원')).toBeVisible();
  await openGuestbook(guest.page, creator.landingUrl);
  await expect(bodies(guest.page)).toHaveText([longBody]);
  await expectMobileFits(guest.page, '/p/{publicId}#guestbook');
  await expect(guest.page.getByRole('tab', { name: '방명록' })).toHaveAttribute('aria-selected', 'true');
});
