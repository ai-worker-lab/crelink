import { randomUUID } from 'node:crypto';
import type { CreatorLandingState, LinkReservationSetting, ReservationMethod } from '@crelink/shared';
import { LandingPassService } from '../src/short-link/landing-pass.service';
import { api, login, type TestApp } from './test-app';

/** 사전 신청 시험의 크리에이터 한 명과 그 링크 하나. */
export interface ReservationCreator {
  cookie: string;
  userId: string;
  slug: string;
  publicId: string;
  shortId: string;
  linkId: string;
  linkPublicId: string;
}

export async function createReservationCreator(t: TestApp): Promise<ReservationCreator> {
  const id = randomUUID();
  const result = await login(t.baseUrl, `${id}|${id}@example.com`);
  const cookie = result.cookie!;
  const state = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
  const created = await addLink(t, cookie);
  const shortId = (
    await t.pool.query<{ id: string }>(
      'SELECT sl.id FROM short_links sl JOIN landings l ON l.id=sl.landing_id WHERE l.public_id=$1',
      [state.landing.publicId],
    )
  ).rows[0].id;
  return {
    cookie,
    userId: result.body.user!.id,
    slug: state.shortLink.slug,
    publicId: state.landing.publicId,
    shortId,
    ...created,
  };
}

export async function addLink(
  t: TestApp,
  cookie: string,
  title = '상품 링크',
): Promise<{ linkId: string; linkPublicId: string }> {
  const linkId = (
    await api<{ id: string }>(t.baseUrl, 'POST', '/api/me/links', {
      cookie,
      body: { title, url: 'https://example.test/product' },
    })
  ).body.id;
  const linkPublicId = (await t.pool.query<{ public_id: string }>('SELECT public_id FROM links WHERE id=$1', [linkId]))
    .rows[0].public_id;
  return { linkId, linkPublicId };
}

export async function setReservation(
  t: TestApp,
  cookie: string,
  linkId: string,
  body: LinkReservationSetting,
): Promise<void> {
  const response = await api(t.baseUrl, 'PUT', `/api/me/links/${linkId}/reservation`, { cookie, body });
  if (response.status !== 200) throw new Error(`설정 실패 ${response.status}`);
}

/** 서명 토큰. `ageMs`만큼 전에 방문한 것으로 만듭니다(기본 10초, 봇 판정 3초 밖). */
export function visitToken(t: TestApp, publicId: string, visitorId = randomUUID(), ageMs = 10_000): string {
  const passes = t.app.get(LandingPassService);
  const nowMs = Date.now() - ageMs;
  return passes.telemetryToken(publicId, passes.issue(publicId, nowMs, visitorId), nowMs)!;
}

export async function seedReservation(
  t: TestApp,
  linkId: string,
  method: ReservationMethod,
  contact: string,
): Promise<string> {
  return (
    await t.pool.query<{ id: string }>(
      "INSERT INTO link_reservations(link_id,method,contact,consent_version) VALUES($1,$2,$3,'test') RETURNING id",
      [linkId, method, contact],
    )
  ).rows[0].id;
}
