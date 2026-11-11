import { createHash } from 'node:crypto';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  CreatorLandingState,
  ManagedPagesResponse,
  PageInviteResponse,
  PageMembersResponse,
  GuestbookPage,
  GuestbookEntryView,
  UploadFileResponse,
  AnalyticsReport,
} from '@crelink/shared';
import { AuthenticatedRequest } from '../src/auth/actor';
import { RetentionService } from '../src/retention/retention.service';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

interface Member {
  cookie: string;
  userId: string;
  publicId: string;
}
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe('공유관리 페이지 API', () => {
  let t: TestApp;
  let n = 0;
  const member = async (): Promise<Member> => {
    const result = await login(t.baseUrl, `page-${++n}|page${n}@example.com`);
    const state = await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: result.cookie });
    return { cookie: result.cookie!, userId: result.body.user!.id, publicId: state.body.landing.publicId };
  };
  const request = <T = { code: string }>(who: Member, method: string, path: string, page?: string, body?: unknown) =>
    api<T>(t.baseUrl, method, path, { cookie: who.cookie, headers: page ? { 'X-Crelink-Page': page } : {}, body });
  const invite = async (owner: Member) => {
    const response = await request<PageInviteResponse>(owner, 'POST', '/api/me/page-invites', owner.publicId);
    expect(response.status).toBe(201);
    return response.body;
  };
  const accept = (who: Member, token: string) => request(who, 'POST', '/api/page-invites/accept', undefined, { token });
  const join = async (owner: Member, editor: Member) =>
    expect((await accept(editor, (await invite(owner)).token)).status).toBe(200);

  beforeAll(async () => {
    t = await createTestApp({
      configure(app) {
        // 가드 이후의 실제 요청을 HTTP 응답 헤더로 관찰합니다. 제품 코드는 바꾸지 않습니다.
        app.useGlobalInterceptors({
          intercept(context: ExecutionContext, next: CallHandler) {
            const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
            const res = context.switchToHttp().getResponse();
            if (req.sessionUser) res.setHeader('X-Test-Session', req.sessionUser.id);
            if (req.actor) res.setHeader('X-Test-Actor', req.actor.userId);
            return next.handle();
          },
        });
      },
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('신규 경로는 로그인이 필요하고 수락은 POST·사람만 허용한다', async () => {
    for (const [method, path] of [
      ['GET', '/api/me/pages'],
      ['GET', '/api/me/page-members'],
      ['POST', '/api/me/page-invites'],
      ['DELETE', '/api/me/page-invites'],
      ['DELETE', '/api/me/page-members/me'],
      ['DELETE', '/api/me/page-members/missing'],
      ['POST', '/api/page-invites/preview'],
      ['POST', '/api/page-invites/accept'],
    ]) {
      expect((await api(t.baseUrl, method, path)).status).toBe(401);
    }
    const owner = await member();
    const token = (await invite(owner)).token;
    const ai = await createAiOperator(t.pool, 'invite-ai@crelink.invalid');
    expect(
      (await api(t.baseUrl, 'POST', '/api/page-invites/accept', { token: ai.token, body: { token } })).status,
    ).toBe(403);
    expect((await request(owner, 'GET', '/api/page-invites/accept')).status).toBe(404);
    expect((await request(owner, 'POST', '/api/page-invites/preview', undefined, { token: 'unknown' })).body.code).toBe(
      'invite_invalid',
    );
  });

  it('권한 표: 헤더 없음·본인·멤버, 위조·없는 페이지·AI 대상, 해제 직후 차단과 정지 대상', async () => {
    const owner = await member();
    const editor = await member();
    const outsider = await member();
    expect((await request(editor, 'GET', '/api/me/landing')).status).toBe(200);
    const own = await request<CreatorLandingState>(owner, 'GET', '/api/me/landing', owner.publicId);
    expect(own.body.pageAccess).toEqual({ role: 'owner', shared: false });
    for (const page of [owner.publicId, 'zzzzzzzzzz', 'BAD']) {
      const response = await request(outsider, 'GET', '/api/me/landing', page);
      expect([response.status, response.body.code]).toEqual([404, 'page_not_found']);
    }
    await join(owner, editor);
    const shared = await request<CreatorLandingState>(editor, 'GET', '/api/me/landing', owner.publicId);
    expect(shared.body.pageAccess).toEqual({ role: 'editor', shared: true });
    expect(shared.headers.get('x-test-session')).toBe(editor.userId);
    expect(shared.headers.get('x-test-actor')).toBe(editor.userId);
    await t.pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [owner.userId]);
    const suspended = await request(editor, 'GET', '/api/me/landing', owner.publicId);
    expect([suspended.status, suspended.body.code]).toEqual([403, 'page_suspended']);
    expect(
      (await request<ManagedPagesResponse>(editor, 'GET', '/api/me/pages')).body.pages.map((p) => p.publicId),
    ).toEqual([editor.publicId]);
    await t.pool.query('UPDATE users SET suspended_at=NULL WHERE id=$1', [owner.userId]);
    expect((await request(owner, 'DELETE', `/api/me/page-members/${editor.userId}`, owner.publicId)).status).toBe(204);
    expect((await request(editor, 'GET', '/api/me/landing', owner.publicId)).body.code).toBe('page_not_found');
    const ai = await createAiOperator(t.pool);
    const rejected = await api(t.baseUrl, 'GET', '/api/me/landing', {
      token: ai.token,
      headers: { 'X-Crelink-Page': owner.publicId },
    });
    expect([rejected.status, rejected.body.code]).toEqual([403, 'forbidden']);
    const aiLanding = (
      await t.pool.query<{ public_id: string }>('SELECT public_id FROM landings WHERE user_id=$1', [ai.userId])
    ).rows[0];
    expect(aiLanding).toBeDefined();
    await t.pool.query('INSERT INTO page_members(page_user_id,member_user_id) VALUES($1,$2)', [
      ai.userId,
      outsider.userId,
    ]);
    expect((await request(outsider, 'GET', '/api/me/landing', aiLanding.public_id)).body.code).toBe('page_not_found');
    expect((await api(t.baseUrl, 'GET', '/api/me/landing', { token: ai.token })).status).toBe(200);
  });

  it('편집자의 소유자 전용 경로 전부는 403이고 적용 금지 경로는 헤더를 무시한다', async () => {
    const owner = await member();
    const editor = await member();
    await join(owner, editor);
    for (const [method, path] of [
      ['GET', '/api/me/short-link/availability?slug=test'],
      ['PUT', '/api/me/short-link/slug'],
      ['PUT', '/api/me/ad-block'],
      ['POST', '/api/me/page-invites'],
      ['DELETE', '/api/me/page-invites'],
      ['GET', '/api/me/page-members'],
      ['DELETE', `/api/me/page-members/${owner.userId}`],
    ]) {
      const response = await request(editor, method, path, owner.publicId, method === 'PUT' ? {} : undefined);
      expect([path, response.status, response.body.code]).toEqual([path, 403, 'page_owner_only']);
    }
    const me = await request<{ id: string }>(editor, 'GET', '/api/me', 'BAD');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(editor.userId);
    expect((await request(editor, 'GET', `/api/public/landings/${owner.publicId}`, 'BAD')).status).toBe(200);
    expect((await request(editor, 'DELETE', '/api/me/page-members/me', owner.publicId)).status).toBe(204);
    expect((await request(editor, 'GET', '/api/me/landing', owner.publicId)).status).toBe(404);
    expect((await request(owner, 'DELETE', '/api/me/page-members/me', owner.publicId)).status).toBe(403);
  });

  it('공유 저장·파일 소유자·ownedFileId·통계는 대상 페이지를 사용하고 개인 페이지는 유지한다', async () => {
    const owner = await member();
    const editor = await member();
    await join(owner, editor);
    const personal = (await request<CreatorLandingState>(editor, 'GET', '/api/me/landing')).body;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'image.png');
    const upload = await fetch(`${t.baseUrl}/api/me/files`, {
      method: 'POST',
      headers: { cookie: editor.cookie, 'X-Crelink-Page': owner.publicId },
      body: form,
    });
    expect(upload.status).toBe(201);
    const file = (await upload.json()) as UploadFileResponse;
    expect(
      (await t.pool.query('SELECT owner_user_id FROM files WHERE id=$1', [file.fileId])).rows[0].owner_user_id,
    ).toBe(owner.userId);
    const saved = await request<CreatorLandingState>(editor, 'PATCH', '/api/me/landing', owner.publicId, {
      displayName: '공유 저장',
      avatarFileId: file.fileId,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.landing.displayName).toBe('공유 저장');
    expect(saved.headers.get('x-test-session')).toBe(editor.userId);
    expect(saved.headers.get('x-test-actor')).toBe(editor.userId);
    expect((await request<CreatorLandingState>(editor, 'GET', '/api/me/landing')).body.landing).toEqual(
      personal.landing,
    );
    expect((await request(editor, 'PUT', '/api/me/socials', owner.publicId, { items: [] })).status).toBe(200);
    await t.pool.query('UPDATE users SET banner_slot_granted_at=now() WHERE id=$1', [owner.userId]);
    for (const [kind, body] of [
      ['links', { title: '공유 링크', url: 'https://example.com', thumbnailFileId: file.fileId }],
      ['portfolio', { title: '공유 작업', imageFileId: file.fileId }],
      ['banners', { imageFileId: file.fileId, alt: '공유 배너' }],
    ] as const) {
      const created = await request<{ id: string }>(editor, 'POST', `/api/me/${kind}`, owner.publicId, body);
      expect([kind, created.status]).toEqual([kind, 201]);
      const id = created.body.id;
      const patch = kind === 'banners' ? { alt: '수정 배너' } : { title: '수정 항목' };
      expect((await request(editor, 'PATCH', `/api/me/${kind}/${id}`, owner.publicId, patch)).status).toBe(200);
      expect((await request(editor, 'PUT', `/api/me/${kind}/order`, owner.publicId, { ids: [id] })).status).toBe(200);
      const state = (await request<CreatorLandingState>(owner, 'GET', '/api/me/landing')).body;
      expect(state[kind].map((item) => item.id)).toContain(id);
      expect((await request(editor, 'DELETE', `/api/me/${kind}/${id}`, owner.publicId)).status).toBe(204);
    }
    for (const path of ['/api/me/imports/instabio/preview', '/api/me/imports/instabio']) {
      // 외부 네트워크 없이 입력 검사까지 도달했음을 확인합니다.
      expect((await request(editor, 'POST', path, owner.publicId, {})).status).toBe(400);
    }
    expect((await request<CreatorLandingState>(editor, 'GET', '/api/me/landing')).body).toEqual(personal);
    await t.pool.query(
      `INSERT INTO visits(short_link_id,slug,visitor_id)
      SELECT sl.id,ss.slug,gen_random_uuid() FROM short_links sl JOIN short_slugs ss ON ss.short_link_id=sl.id
      WHERE sl.user_id=$1 LIMIT 1`,
      [owner.userId],
    );
    const reportOwner = await request<AnalyticsReport>(owner, 'GET', '/api/me/analytics', owner.publicId);
    const reportEditor = await request<AnalyticsReport>(editor, 'GET', '/api/me/analytics', owner.publicId);
    expect(reportEditor.status).toBe(200);
    expect(reportEditor.body).toEqual({ ...reportOwner.body, generatedAt: expect.any(String) });
    expect(reportEditor.body.scope.creatorId).toBe(owner.userId);
    expect(reportEditor.body.legacy.visits).toBe(1);
    expect((await request<AnalyticsReport>(editor, 'GET', '/api/me/analytics')).body.legacy.visits).toBe(0);
    const pages = (await request<ManagedPagesResponse>(editor, 'GET', '/api/me/pages')).body.pages;
    expect(pages.map((p) => [p.publicId, p.access, p.role])).toEqual([
      [editor.publicId, 'personal', 'owner'],
      [owner.publicId, 'shared', 'editor'],
    ]);
  });

  it('방명록 비밀글·숨김은 멤버가 관리하고 작성자 id와 다른 페이지의 범위는 유지한다', async () => {
    const owner = await member();
    const editor = await member();
    const author = await member();
    await join(owner, editor);
    const entry = await request<GuestbookEntryView>(
      author,
      'POST',
      `/api/landings/${owner.publicId}/guestbook`,
      undefined,
      { body: '비밀', secret: true },
    );
    expect(entry.status).toBe(201);
    expect(
      (await request(editor, 'PUT', `/api/guestbook/${entry.body.id}/hidden`, undefined, { hidden: true })).status,
    ).toBe(200);
    const page = (await request<GuestbookPage>(editor, 'GET', `/api/landings/${owner.publicId}/guestbook`, 'BAD')).body;
    expect(page.viewer.isOwner).toBe(true);
    expect(page.entries[0]).toMatchObject({ id: entry.body.id, hidden: true });
    expect(
      (await request<GuestbookPage>(author, 'GET', `/api/landings/${owner.publicId}/guestbook`)).body.entries[0].hidden,
    ).toBe(false);
    const written = await request<GuestbookEntryView>(
      editor,
      'POST',
      `/api/landings/${owner.publicId}/guestbook`,
      owner.publicId,
      { body: '멤버 작성', secret: true },
    );
    expect(
      (await t.pool.query('SELECT author_user_id FROM guestbook_entries WHERE id=$1', [written.body.id])).rows[0]
        .author_user_id,
    ).toBe(editor.userId);
    const unrelated = await request<GuestbookEntryView>(
      author,
      'POST',
      `/api/landings/${author.publicId}/guestbook`,
      undefined,
      { body: '다른 페이지', secret: true },
    );
    expect(
      (await request(editor, 'PUT', `/api/guestbook/${unrelated.body.id}/hidden`, undefined, { hidden: true })).status,
    ).toBe(404);
    await t.pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [owner.userId]);
    expect(
      (await request(editor, 'PUT', `/api/guestbook/${entry.body.id}/hidden`, undefined, { hidden: false })).status,
    ).toBe(404);
    await t.pool.query('UPDATE users SET suspended_at=NULL WHERE id=$1', [owner.userId]);
    await request(owner, 'DELETE', `/api/me/page-members/${editor.userId}`, owner.publicId);
    expect(
      (await request<GuestbookPage>(editor, 'GET', `/api/landings/${owner.publicId}/guestbook`)).body.viewer.isOwner,
    ).toBe(false);
  });

  it('초대 해시·만료·재발급·취소·자기 페이지·기존 멤버·재사용·멤버 목록', async () => {
    const owner = await member();
    const editor = await member();
    const other = await member();
    const first = await invite(owner);
    const stored = (
      await t.pool.query('SELECT token_hash,expires_at FROM page_invites WHERE page_user_id=$1', [owner.userId])
    ).rows[0];
    expect(stored.token_hash).toBe(createHash('sha256').update(first.token).digest('hex'));
    expect(stored.token_hash).not.toBe(first.token);
    expect(Math.abs(stored.expires_at.getTime() - Date.now() - 72 * 3600000)).toBeLessThan(10000);
    expect(
      (await request(owner, 'POST', '/api/page-invites/preview', undefined, { token: first.token })).body.code,
    ).toBe('invite_own_page');
    expect((await accept(owner, first.token)).body.code).toBe('invite_own_page');
    expect((await request(editor, 'POST', '/api/page-invites/preview', undefined, { token: first.token })).status).toBe(
      200,
    );
    expect((await accept(editor, first.token)).status).toBe(200);
    expect((await accept(other, first.token)).body.code).toBe('invite_invalid');
    const second = await invite(owner);
    expect((await accept(editor, second.token)).body.code).toBe('already_member');
    const members = await request<PageMembersResponse>(owner, 'GET', '/api/me/page-members', owner.publicId);
    expect(members.body.members.map((m) => m.userId)).toEqual([editor.userId]);
    expect(members.body.invite).not.toBeNull();
    await t.pool.query("UPDATE page_invites SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [
      createHash('sha256').update(second.token).digest('hex'),
    ]);
    expect((await accept(other, second.token)).body.code).toBe('invite_invalid');
    const third = await invite(owner);
    const fourth = await invite(owner);
    expect((await accept(other, third.token)).body.code).toBe('invite_invalid');
    expect((await request(owner, 'DELETE', '/api/me/page-invites', owner.publicId)).status).toBe(204);
    expect((await accept(other, fourth.token)).body.code).toBe('invite_invalid');
    expect((await request(owner, 'DELETE', '/api/me/page-members/not-uuid', owner.publicId)).body.code).toBe(
      'member_not_found',
    );
  });

  it('동시 수락은 한 번 성공하고 인원 초과·정지 시 소비를 롤백한다', async () => {
    const owner = await member();
    const a = await member();
    const b = await member();
    const token = (await invite(owner)).token;
    const results = await Promise.all([accept(a, token), accept(b, token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    const next = await invite(owner);
    for (let i = 0; i < 4; i++) {
      const m = await member();
      await t.pool.query('INSERT INTO page_members VALUES($1,$2,now())', [owner.userId, m.userId]);
    }
    const outsider = await member();
    expect((await accept(outsider, next.token)).body.code).toBe('page_member_limit');
    expect((await request(owner, 'POST', '/api/me/page-invites', owner.publicId)).body.code).toBe('page_member_limit');
    expect(
      (
        await t.pool.query('SELECT used_at FROM page_invites WHERE token_hash=$1', [
          createHash('sha256').update(next.token).digest('hex'),
        ])
      ).rows[0].used_at,
    ).toBeNull();
    await t.pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [owner.userId]);
    expect((await accept(outsider, next.token)).body.code).toBe('page_suspended');
  });

  it('보존 작업은 만료·사용 후 7일 경계로 초대를 지운다', async () => {
    const owner = await member();
    await t.pool.query(
      `INSERT INTO page_invites(page_user_id,token_hash,expires_at,used_at) VALUES
      ($1,repeat('a',64),now()-interval '8 days',NULL),
      ($1,repeat('b',64),now()-interval '9 days',now()-interval '8 days'),
      ($1,repeat('c',64),now()-interval '1 day',NULL),
      ($1,repeat('d',64),now()+interval '1 day',NULL)`,
      [owner.userId],
    );
    await t.app.get(RetentionService).runOnce();
    expect(
      (
        await t.pool.query('SELECT token_hash FROM page_invites WHERE page_user_id=$1 ORDER BY token_hash', [
          owner.userId,
        ])
      ).rows.map((r) => r.token_hash),
    ).toEqual(['c'.repeat(64), 'd'.repeat(64)]);
  });
});
