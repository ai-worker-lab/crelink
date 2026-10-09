import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import {
  AdBannerListResponse,
  AdBannerView,
  CreatorBannerView,
  LinkView,
  OperatorActionType,
  UploadFileResponse,
} from '@crelink/shared';
import { OperatorGuard } from '../src/auth/session.guard';
import { PNG_STILL } from './image-samples';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

const WRITE_METHODS: Partial<Record<RequestMethod, true>> = {
  [RequestMethod.POST]: true,
  [RequestMethod.PUT]: true,
  [RequestMethod.PATCH]: true,
  [RequestMethod.DELETE]: true,
};

/**
 * `OperatorGuard` 아래의 상태 변경 경로 중 행동 기록을 남기지 않아도 되는 것과 그 이유.
 * 새 운영자 쓰기 경로는 아래 `AUDITED`(행동과 시험 호출)나 여기에 넣어야 이 시험이 통과합니다.
 */
const EXEMPT: Record<string, string> = {
  'POST /api/admin/agent-runs': 'AI 실행 기록 열기. 실행 기록(agent_runs) 자체가 기록입니다.',
  'PATCH /api/admin/agent-runs/:runId': 'AI 실행 기록 갱신·닫기. 실행 기록(agent_runs) 자체가 기록입니다.',
};

interface Fixtures {
  operator: string;
  creatorId: string;
  linkId: string;
  bannerId: string;
  imageId: string;
  adBannerId: string;
  tokenId: string;
}

/** 운영자 쓰기 경로 → 남겨야 할 행동과 사람 운영자로 부르는 시험 호출(순서대로 실행). */
const AUDITED: Record<string, { action: OperatorActionType; call: (t: TestApp, f: Fixtures) => Promise<number> }> = {
  'PUT /api/admin/creators/:userId/extra-slots': {
    action: 'creator.extra_slots',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', `/api/admin/creators/${f.creatorId}/extra-slots`, {
          cookie: f.operator,
          body: { extraSlots: 1 },
        })
      ).status,
  },
  'PUT /api/admin/creators/:userId/suspension': {
    action: 'creator.suspension',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', `/api/admin/creators/${f.creatorId}/suspension`, {
          cookie: f.operator,
          body: { suspended: false },
        })
      ).status,
  },
  'PUT /api/admin/creators/:userId/banner-slot': {
    action: 'creator.banner_slot',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', `/api/admin/creators/${f.creatorId}/banner-slot`, {
          cookie: f.operator,
          body: { granted: true },
        })
      ).status,
  },
  'PUT /api/admin/creators/:userId/metrics-exclusion': {
    action: 'creator.metrics_exclusion',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', `/api/admin/creators/${f.creatorId}/metrics-exclusion`, {
          cookie: f.operator,
          body: { excluded: true },
        })
      ).status,
  },
  'PUT /api/admin/links/:linkId/block': {
    action: 'link.block',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', `/api/admin/links/${f.linkId}/block`, {
          cookie: f.operator,
          body: { blocked: true },
        })
      ).status,
  },
  'PUT /api/admin/banners/:bannerId/block': {
    action: 'banner.block',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', `/api/admin/banners/${f.bannerId}/block`, {
          cookie: f.operator,
          body: { blocked: true },
        })
      ).status,
  },
  'POST /api/admin/blocked-domains': {
    action: 'blocked_domain.add',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
          cookie: f.operator,
          body: { domain: 'coverage.example' },
        })
      ).status,
  },
  'DELETE /api/admin/blocked-domains/:domain': {
    action: 'blocked_domain.remove',
    call: async (t, f) =>
      (await api(t.baseUrl, 'DELETE', '/api/admin/blocked-domains/coverage.example', { cookie: f.operator })).status,
  },
  'POST /api/admin/ad-banners': {
    action: 'ad_banner.create',
    call: async (t, f) => {
      const created = await api<AdBannerView>(t.baseUrl, 'POST', '/api/admin/ad-banners', {
        cookie: f.operator,
        body: { imageFileId: f.imageId, alt: '시험', url: 'https://ad.example/', startsAt: new Date().toISOString() },
      });
      f.adBannerId = created.body.id;
      return created.status;
    },
  },
  'PUT /api/admin/ad-banners/order': {
    action: 'ad_banner.reorder',
    call: async (t, f) => {
      const list = await api<AdBannerListResponse>(t.baseUrl, 'GET', '/api/admin/ad-banners', { cookie: f.operator });
      return (
        await api(t.baseUrl, 'PUT', '/api/admin/ad-banners/order', {
          cookie: f.operator,
          body: { ids: list.body.items.map((item) => item.id) },
        })
      ).status;
    },
  },
  'PATCH /api/admin/ad-banners/:id': {
    action: 'ad_banner.update',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PATCH', `/api/admin/ad-banners/${f.adBannerId}`, {
          cookie: f.operator,
          body: { alt: '새 시험' },
        })
      ).status,
  },
  'PUT /api/admin/ad-banners/:id/end': {
    action: 'ad_banner.end',
    call: async (t, f) =>
      (await api(t.baseUrl, 'PUT', `/api/admin/ad-banners/${f.adBannerId}/end`, { cookie: f.operator })).status,
  },
  'PUT /api/admin/ai-operator/pause': {
    action: 'ai_operator.pause',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', '/api/admin/ai-operator/pause', {
          cookie: f.operator,
          body: { paused: false },
        })
      ).status,
  },
  'PUT /api/admin/ai-operator/tokens/:tokenId/revoke': {
    action: 'ai_operator.token_revoke',
    call: async (t, f) =>
      (await api(t.baseUrl, 'PUT', `/api/admin/ai-operator/tokens/${f.tokenId}/revoke`, { cookie: f.operator })).status,
  },
  'PUT /api/admin/slot-event': {
    action: 'slot_event.period_update',
    call: async (t, f) =>
      (
        await api(t.baseUrl, 'PUT', '/api/admin/slot-event', {
          cookie: f.operator,
          body: { startsAt: '2026-10-01T00:00:00Z', endsAt: null },
        })
      ).status,
  },
};

const paths = (value: unknown): string[] => (Array.isArray(value) ? value : [value ?? '']).map(String);

/**
 * Nest 라우트 메타데이터에서 `OperatorGuard`(클래스나 메서드)가 걸린 POST·PUT·PATCH·DELETE 경로를 모두 찾습니다.
 * 전역 접두사 `api`를 붙인 `METHOD /api/...` 형식입니다.
 */
function operatorWriteRoutes(t: TestApp): { writes: string[]; adminWithoutGuard: string[] } {
  const writes = new Set<string>();
  const adminWithoutGuard = new Set<string>();
  const controllers = new Set<new (...args: never[]) => unknown>();
  for (const module of t.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      if (wrapper.metatype) controllers.add(wrapper.metatype as new (...args: never[]) => unknown);
    }
  }
  for (const controller of controllers) {
    const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = (controller.prototype as Record<string, unknown>)[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined || !Reflect.hasMetadata(PATH_METADATA, handler)) continue;
      const guards = [...classGuards, ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? [])];
      for (const base of paths(Reflect.getMetadata(PATH_METADATA, controller))) {
        for (const sub of paths(Reflect.getMetadata(PATH_METADATA, handler))) {
          const path = `/api/${[base, sub]
            .map((part) => part.replace(/^\/+|\/+$/g, ''))
            .filter(Boolean)
            .join('/')}`;
          const route = `${RequestMethod[method]} ${path}`;
          const operatorOnly = guards.includes(OperatorGuard);
          if (operatorOnly && WRITE_METHODS[method]) writes.add(route);
          if (path.startsWith('/api/admin') && !operatorOnly) adminWithoutGuard.add(route);
        }
      }
    }
  }
  return { writes: [...writes].sort(), adminWithoutGuard: [...adminWithoutGuard].sort() };
}

/**
 * 모든 운영자 쓰기가 행동 기록을 남기는지 구조적으로 확인합니다(AI 운영자 설계 `행동 기록 규칙`, 보안 검토 F3).
 * 경로 목록이 `AUDITED`·`EXEMPT`와 정확히 같아야 하고, `AUDITED`의 각 경로를 실제로 불러 그 행동 기록 1건이 생기는지 봅니다.
 */
describe('운영자 쓰기 행동 기록 범위 (R23 ③)', () => {
  let t: TestApp;
  const fixtures = {} as Fixtures;

  beforeAll(async () => {
    t = await createTestApp();
    fixtures.operator = (await login(t.baseUrl, 'coverage-op|operator@example.com')).cookie!;
    const creator = await login(t.baseUrl, 'coverage-creator|coverage@example.com');
    fixtures.creatorId = creator.body.user!.id;
    fixtures.linkId = (
      await api<LinkView>(t.baseUrl, 'POST', '/api/me/links', {
        cookie: creator.cookie,
        body: { title: '링크', url: 'https://link.example/' },
      })
    ).body.id;
    const upload = async (cookie: string) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(PNG_STILL)], { type: 'image/png' }), 'image.png');
      const response = await fetch(`${t.baseUrl}/api/me/files`, { method: 'POST', headers: { cookie }, body: form });
      return ((await response.json()) as UploadFileResponse).fileId;
    };
    await t.pool.query('UPDATE users SET banner_slot_granted_at = now() WHERE id = $1', [fixtures.creatorId]);
    const banner = await api<CreatorBannerView>(t.baseUrl, 'POST', '/api/me/banners', {
      cookie: creator.cookie,
      body: { imageFileId: await upload(creator.cookie!), alt: '배너', url: 'https://banner.example/' },
    });
    expect(banner.status).toBe(201);
    fixtures.bannerId = banner.body.id;
    await t.pool.query('UPDATE users SET banner_slot_granted_at = NULL WHERE id = $1', [fixtures.creatorId]);
    fixtures.imageId = await upload(fixtures.operator);
    fixtures.tokenId = (await createAiOperator(t.pool)).tokenId;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('OperatorGuard 아래 쓰기 경로는 모두 행동 기록 대상이거나 이유가 적힌 예외이고, /api/admin은 모두 OperatorGuard 아래다', () => {
    const { writes, adminWithoutGuard } = operatorWriteRoutes(t);
    expect(writes).toEqual([...Object.keys(AUDITED), ...Object.keys(EXEMPT)].sort());
    expect(adminWithoutGuard).toEqual([]);
  });

  it('행동 기록 대상 경로는 부를 때마다 그 행동 기록 1건을 남긴다', async () => {
    for (const [route, { action, call }] of Object.entries(AUDITED)) {
      const before = (await t.pool.query<{ count: number }>('SELECT count(*)::int AS count FROM operator_actions'))
        .rows[0].count;
      const status = await call(t, fixtures);
      const after = await t.pool.query<{ count: number; action: string | null }>(
        `SELECT count(*)::int AS count,
                (SELECT action FROM operator_actions ORDER BY created_at DESC, id DESC LIMIT 1) AS action
         FROM operator_actions`,
      );
      expect([route, status < 300, after.rows[0].count - before, after.rows[0].action]).toEqual([
        route,
        true,
        1,
        action,
      ]);
    }
  });
});
