import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Bowser from 'bowser';
import type { Request } from 'express';
import maxmind, { CityResponse, Reader } from 'maxmind';
import { isIP } from 'node:net';
import { AppConfig } from '../config.service';
import { Database } from '../database';

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

/**
 * 방문자 IP. 프록시 헤더(`X-Forwarded-For`)는 클라이언트가 마음대로 넣을 수 있어, 신뢰할 프록시 설정이 생기기 전까지 쓰지 않고
 * TCP 연결의 소켓 주소만 씁니다. 근거: apps/api/docs/README.md#방문자-ip
 */
function socketIp(request: Request): string | null {
  const address = request.socket.remoteAddress?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '') ?? null;
  return address && isIP(address) ? address : null;
}

export function requestFacts(request: Request): RequestFacts {
  const referrer = request.headers.referer?.slice(0, REFERRER_MAX) || null;
  return {
    ip: socketIp(request),
    referrer,
    referrerHost: referrer && URL.canParse(referrer) ? new URL(referrer).hostname || null : null,
    userAgent: request.headers['user-agent']?.slice(0, USER_AGENT_MAX) || null,
  };
}

/** 방문(R2·R9)과 외부 링크 클릭 기록. 리디렉트는 이 저장을 기다리지 않습니다. */
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

  /** 저장 실패는 리디렉트에 영향을 주지 않고 로그만 남깁니다. */
  inBackground(kind: string, record: Promise<void>): void {
    record.catch((error: unknown) =>
      this.logger.error(`${kind} 기록 실패: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}
