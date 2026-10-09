import { HttpStatus } from '@nestjs/common';
import { CRELINK_LIMITS } from '@crelink/shared';
import { apiError } from './http';

/** JSON 본문이 객체인지 확인합니다. */
export function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '요청 본문은 JSON 객체여야 합니다.');
  }
  return body as Record<string, unknown>;
}

/**
 * 선택 문자열. undefined는 "바꾸지 않음", null·빈 문자열(공백만 포함)은 "비움"(null)입니다.
 * label은 오류 문구에 쓰는 항목 이름입니다.
 */
export function optionalText(value: unknown, label: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `${label}은(는) 문자열이어야 합니다.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `${label}은(는) ${max}자 이하로 입력해 주세요.`);
  }
  return text || null;
}

/** 필수 문자열(공백 제외 1자 이상). */
export function requiredText(value: unknown, label: string, max: number): string {
  const text = optionalText(value, label, max);
  if (!text) throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `${label}을(를) 입력해 주세요.`);
  return text;
}

export function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `${label}은(는) true 또는 false여야 합니다.`);
  }
  return value;
}

/** 선택 0 이상 정수. 아니면 400 `validation_failed`. */
export function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', `${label}은(는) 0 이상의 정수여야 합니다.`);
  }
  return value;
}

/** http·https 절대 URL만 받습니다. 맞지 않으면 null. */
export function parseHttpUrl(value: string): URL | null {
  if (value.length > CRELINK_LIMITS.urlMax || !URL.canParse(value)) return null;
  const url = new URL(value);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
  return url;
}

/** `{ ids: string[] }` 순서 변경 요청. 현재 id 집합과 정확히 같지 않으면 400 `order_mismatch`. */
export function orderedIds(body: unknown, currentIds: string[]): string[] {
  const ids = bodyObject(body).ids;
  const mismatch = apiError(
    HttpStatus.BAD_REQUEST,
    'order_mismatch',
    '목록이 바뀌었습니다. 새로고침한 뒤 다시 순서를 바꿔 주세요.',
  );
  if (!Array.isArray(ids) || ids.length !== currentIds.length) throw mismatch;
  const current = new Set(currentIds);
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !current.has(id) || seen.has(id)) throw mismatch;
    seen.add(id);
  }
  return ids as string[];
}
