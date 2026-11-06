import { HttpStatus, Injectable } from '@nestjs/common';
import { CRELINK_LIMITS, type InstabioImportPreview } from '@crelink/shared';
import { createHash } from 'node:crypto';
import { apiError } from '../common/http';
import { parseHttpUrl } from '../common/input';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
  return value as RecordValue;
};
const array = (value: unknown): unknown[] => {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new Error('array');
  return parsed;
};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
export const unavailable = () =>
  apiError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'import_unavailable',
    '원본을 가져오지 못했어요. 공개된 Instabio 주소와 페이지 상태를 확인한 뒤 다시 미리보기해 주세요.',
  );

export function instabioUrl(value: unknown): URL {
  const url = typeof value === 'string' && value.length <= CRELINK_LIMITS.urlMax ? URL.parse(value.trim()) : null;
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.hostname !== 'instabio.cc' ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/[A-Za-z0-9]{6,40}\/?$/.test(url.pathname)
  ) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'https://instabio.cc/페이지ID 형식의 공개 주소를 입력해 주세요.',
    );
  }
  return new URL(`https://instabio.cc/${url.pathname.split('/')[1]}`);
}

/** 사용자 입력이나 원본의 임의 URL을 가져오는 다운로더로 확장하지 않습니다. */
export function instabioImage(value: unknown): string | null {
  const url = typeof value === 'string' ? URL.parse(value) : null;
  return url &&
    url.protocol === 'https:' &&
    url.hostname === 'bio.linkcdn.cc' &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    /^\/upload\/[a-zA-Z0-9]+\/\d+\/\d+\.(jpg|jpeg|png|webp|gif)$/i.test(url.pathname)
    ? url.href
    : null;
}

function conditional(value: unknown): boolean {
  if (!value) return false;
  try {
    const other = object(typeof value === 'string' ? JSON.parse(value) : value);
    const lock = other.actionLock ? object(other.actionLock) : {};
    return Boolean(other.scheduled || other.startTS || other.endTS || lock.lock || other.lock || other.password);
  } catch {
    return true;
  }
}

/** 공개 JSON만 해석하며 JavaScript/HTML을 실행하지 않습니다. */
export function parseInstabio(sourceUrl: string, html: string, payload: unknown): InstabioImportPreview {
  try {
    const match = html.match(/<script\b[^>]*>\s*window\.__data\s*=\s*({[\s\S]*?})\s*;?\s*<\/script\s*>/i);
    if (!match) throw new Error('profile');
    const data = object(JSON.parse(match[1]));
    const ui = object(data.ui);
    const bio = object(data.bio);
    const id = new URL(sourceUrl).pathname.slice(1);
    const body = object(payload);
    if (bio.id !== id || body.linkid !== id || data.state !== 1 || ui.state !== 1) throw new Error('page');
    const warnings = new Set<string>();
    const components = array(body.cmpts).map(object);
    const orders = array(body.orders);
    if (components.length > 200 || orders.length > 200) throw new Error('size');
    const links: InstabioImportPreview['links'] = [];
    const seen = new Set<string>();
    for (const componentId of orders) {
      const component = components.find((item) => item.id === componentId);
      if (!component || component.state !== 1) continue;
      if (component.subtype !== 'cmpt-button-buttonLink' || conditional(component.other)) {
        warnings.add('버튼 링크 이외의 구성요소·예약·잠금 항목은 가져오지 않아요.');
        continue;
      }
      for (const raw of array(component.links)) {
        const item = object(raw);
        if (item.state !== 1) continue;
        const url = parseHttpUrl(text(item.link));
        const title = text(item.title);
        const itemId = `${String(component.id)}:${String(item.id)}`;
        if (
          item.type !== 1 ||
          conditional(item.other) ||
          !url ||
          url.username ||
          url.password ||
          !title ||
          title.length > 2000 ||
          seen.has(itemId)
        ) {
          warnings.add('지원하지 않는 주소·비어 있는 제목·예약·잠금 항목은 제외했어요.');
          continue;
        }
        seen.add(itemId);
        if (links.length >= CRELINK_LIMITS.totalLinks) throw new Error('too many links');
        const imageUrl = instabioImage(item.icon);
        if (item.icon && !imageUrl) warnings.add('지원하지 않는 이미지 주소는 제외했어요.');
        // 배열이 실제 표시 순서입니다. order 값은 역순일 수 있어 다시 정렬하지 않습니다.
        links.push({ id: itemId, title, url: url.href, imageUrl });
      }
    }
    if (array(body.pages ?? []).length) warnings.add('다른 하위 페이지는 포함하지 않아요.');
    const profile = {
      displayName: text(ui.title) || text(ui.username) || null,
      bio: text(ui.desc) || null,
      avatarUrl: instabioImage(ui.avatar || ui.logo),
    };
    if ((profile.displayName && profile.displayName.length > 2000) || (profile.bio && profile.bio.length > 10000))
      throw new Error('profile size');
    const content = { sourceUrl, profile, links, warnings: [...warnings] };
    return { ...content, fingerprint: createHash('sha256').update(JSON.stringify(content)).digest('hex') };
  } catch {
    throw unavailable();
  }
}

@Injectable()
export class InstabioSource {
  /** 모든 응답을 stream으로 제한하고 redirect를 금지합니다. 쿠키·인증 헤더는 전달하지 않습니다. */
  async read(url: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
    const controller = AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]);
    try {
      const response = await fetch(url, { redirect: 'error', signal: controller, headers: { accept: '*/*' } });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error('response');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error('size');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return Buffer.concat(chunks, size);
    } catch {
      throw unavailable();
    }
  }

  async preview(value: unknown): Promise<InstabioImportPreview> {
    const url = instabioUrl(value);
    const id = url.pathname.slice(1);
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]);
    const reads = [
      this.read(url.href, 1024 * 1024, signal),
      this.read(`https://bio.linkcdn.cc/upload/lnkcmpts/${id}.json`, 1024 * 1024, signal),
    ];
    let html: Buffer, data: Buffer;
    try {
      [html, data] = await Promise.all(reads);
    } catch (error) {
      abort.abort();
      await Promise.allSettled(reads);
      throw error;
    }

    try {
      return parseInstabio(url.href, html.toString('utf8'), JSON.parse(data.toString('utf8')));
    } catch {
      throw unavailable();
    }
  }
}
