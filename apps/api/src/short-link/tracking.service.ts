import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Bowser from 'bowser';
import type { Request } from 'express';
import maxmind, { CityResponse, Reader } from 'maxmind';
import { isIP } from 'node:net';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { countBusinessMetric } from '../monitoring/metrics';
import { STATS_TIME_ZONE } from '../retention/retention.service';

const REFERRER_MAX = 2048;
const USER_AGENT_MAX = 512;

/** IP → 국가(ISO 3166-1 alpha-2)·도시(영문). `GEOIP_MMDB_PATH`가 없으면 둘 다 null입니다. */
@Injectable()
export class GeoIpService implements OnModuleInit {
  private readonly logger = new Logger(GeoIpService.name);
  private reader: Reader<CityResponse> | null = null;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit() {
    const path = this.config.geoipMmdbPath;
    if (!path) {
      this.logger.warn('GEOIP_MMDB_PATH가 비어 있어 방문·클릭 기록의 국가·도시를 비워 둡니다.');
      return;
    }
    try {
      this.reader = await maxmind.open<CityResponse>(path);
    } catch (error) {
      this.logger.error(
        `GEOIP_MMDB_PATH(${path})를 열지 못해 국가·도시를 비워 둡니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  lookup(ip: string | null): { country: string | null; city: string | null } {
    const found = ip && this.reader ? this.reader.get(ip) : null;
    return { country: found?.country?.iso_code ?? null, city: found?.city?.names?.en ?? null };
  }
}

/** 요청에서 뽑은 방문·클릭 공통 항목. */
interface RequestFacts {
  ip: string | null;
  referrer: string | null;
  referrerHost: string | null;
  userAgent: string | null;
}

/** IPv4-mapped IPv6(`::ffff:1.2.3.4`)는 IPv4로, IPv6는 소문자로 바꿉니다. IP가 아니면 null. */
function normalizeIp(value: string | undefined): string | null {
  const address = value
    ?.trim()
    .toLowerCase()
    .replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  return address && isIP(address) ? address : null;
}

/**
 * 방문자 IP. `trustedProxyHops`(`TRUSTED_PROXY_HOPS`)가 0이면 TCP 연결의 소켓 주소만 씁니다. N이면 앞단의 신뢰할 프록시 N단이
 * `X-Forwarded-For` 끝에 차례로 덧붙인다고 보고 오른쪽에서 N번째 값(가장 바깥 신뢰 프록시가 본 클라이언트 주소)을 씁니다.
 * 그보다 앞의 값은 클라이언트가 넣을 수 있어 무시하고, 값이 N개보다 적거나 IP가 아니면 소켓 주소로 돌아갑니다.
 * 근거: apps/api/docs/README.md#방문자-ip
 */
export function clientIp(
  socketAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedProxyHops: number,
): string | null {
  const socket = normalizeIp(socketAddress);
  if (trustedProxyHops === 0 || forwardedFor === undefined) return socket;
  const hops = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor).split(',');
  if (hops.length < trustedProxyHops) return socket;
  return normalizeIp(hops[hops.length - trustedProxyHops]) ?? socket;
}

export function requestFacts(request: Request, trustedProxyHops: number): RequestFacts {
  const referrer = request.headers.referer?.slice(0, REFERRER_MAX) || null;
  return {
    ip: clientIp(request.socket.remoteAddress, request.headers['x-forwarded-for'], trustedProxyHops),
    referrer,
    referrerHost: referrer && URL.canParse(referrer) ? new URL(referrer).hostname || null : null,
    userAgent: request.headers['user-agent']?.slice(0, USER_AGENT_MAX) || null,
  };
}

/** 방문(R2·R9), 외부 링크·크리에이터 배너 클릭, 크리링 배너 노출·클릭 기록. 리디렉트는 이 저장을 기다리지 않습니다. */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly database: Database,
    private readonly geo: GeoIpService,
  ) {}

  private describe(facts: RequestFacts) {
    const parsed = facts.userAgent ? Bowser.parse(facts.userAgent) : null;
    return {
      ...this.geo.lookup(facts.ip),
      deviceType: parsed?.platform.type ?? null,
      browser: parsed?.browser.name ?? null,
      os: parsed?.os.name ?? null,
    };
  }

  async recordVisit(shortLinkId: string, slug: string, visitorId: string, facts: RequestFacts): Promise<void> {
    const { country, city, deviceType, browser, os } = this.describe(facts);
    await this.database.query(
      `INSERT INTO visits (short_link_id, slug, visitor_id, ip, country, city, referrer, referrer_host, user_agent, device_type, browser, os)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        shortLinkId,
        slug,
        visitorId,
        facts.ip,
        country,
        city,
        facts.referrer,
        facts.referrerHost,
        facts.userAgent,
        deviceType,
        browser,
        os,
      ],
    );
  }

  async recordClick(
    link: { id: string; publicId: string; shortLinkId: string },
    visitorId: string,
    facts: RequestFacts,
  ): Promise<void> {
    const { country, city, deviceType, browser, os } = this.describe(facts);
    await this.database.query(
      `INSERT INTO link_clicks (link_id, link_public_id, short_link_id, visitor_id, ip, country, city, referrer_host, user_agent, device_type, browser, os)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        link.id,
        link.publicId,
        link.shortLinkId,
        visitorId,
        facts.ip,
        country,
        city,
        facts.referrerHost,
        facts.userAgent,
        deviceType,
        browser,
        os,
      ],
    );
  }

  /** 크리에이터 배너 클릭 원본(R21 ④, `link_clicks`와 같은 항목). 1년 뒤 보존 작업이 `creator_banner_click_rollups`로 옮깁니다. */
  async recordBannerClick(
    banner: { id: string; publicId: string; shortLinkId: string },
    visitorId: string,
    facts: RequestFacts,
  ): Promise<void> {
    const { country, city, deviceType, browser, os } = this.describe(facts);
    await this.database.query(
      `INSERT INTO creator_banner_clicks (banner_id, banner_public_id, short_link_id, visitor_id, ip, country, city, referrer_host, user_agent, device_type, browser, os)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        banner.id,
        banner.publicId,
        banner.shortLinkId,
        visitorId,
        facts.ip,
        country,
        city,
        facts.referrerHost,
        facts.userAgent,
        deviceType,
        browser,
        os,
      ],
    );
  }

  /**
   * 크리링 배너 노출·클릭 카운터(R20 ⑧). 개인 식별 정보 없이 날짜(Asia/Seoul)·배너·랜딩별 행에 1을 더합니다.
   * 노출은 공개 랜딩 API(`passAccepted`일 때 첫 장), 클릭은 `GET {SHORT}/a/{배너}/{랜딩}`이 부릅니다. 둘 다 `inBackground`로 감쌉니다.
   * 지표 `crelink.ad_banner.impression`·`crelink.ad_banner.click`은 기록 시작 때 셉니다(저장 실패와 무관, 방문·클릭 지표와 같음).
   */
  async recordAdStat(kind: 'impression' | 'click', adBannerId: string, landingPublicId: string): Promise<void> {
    countBusinessMetric(kind === 'impression' ? 'crelink.ad_banner.impression' : 'crelink.ad_banner.click');
    const column = kind === 'impression' ? 'impressions' : 'clicks';
    await this.database.query(
      `INSERT INTO ad_banner_daily_stats (day, ad_banner_id, landing_public_id, ${column})
       VALUES ((now() AT TIME ZONE $1)::date, $2, $3, 1)
       ON CONFLICT (ad_banner_id, day, landing_public_id)
       DO UPDATE SET ${column} = ad_banner_daily_stats.${column} + 1`,
      [STATS_TIME_ZONE, adBannerId, landingPublicId],
    );
  }

  /** 저장 실패는 리디렉트에 영향을 주지 않고 로그만 남깁니다. */
  inBackground(kind: string, record: Promise<void>): void {
    record.catch((error: unknown) =>
      this.logger.error(`${kind} 기록 실패: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}
