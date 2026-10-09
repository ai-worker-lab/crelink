/**
 * 운영자 게시 기간 입력(`datetime-local`)과 API 시각(시간대가 붙은 ISO 8601) 사이의 변환(설계 docs/specs/crelink-ad-banner.md
 * `상수·경로·오류 코드`, 기술 검토 B9). 입력은 브라우저 시간대와 관계없이 늘 한국 시간(Asia/Seoul)으로 읽고 씁니다.
 * 한국 시간은 일광 절약 시간이 없어 +09:00 고정입니다.
 */

const SEOUL_OFFSET = '+09:00';
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** API 시각을 `datetime-local` 값(`YYYY-MM-DDTHH:mm`, 한국 시간)으로 바꿉니다. 초 이하는 버립니다. */
export function toSeoulInput(iso: string): string {
  return new Date(new Date(iso).getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * `datetime-local` 값(한국 시간)을 API 시각(`YYYY-MM-DDTHH:mm:00+09:00`)으로 바꿉니다. 형식이 아니거나 없는 날짜면 null입니다.
 * 브라우저가 초를 붙여 준 값(`HH:mm:ss`)은 받지 않도록 입력의 `step`을 기본(60초)으로 둡니다.
 */
export function fromSeoulInput(value: string): string | null {
  const match = INPUT_PATTERN.exec(value);
  if (!match) return null;
  const iso = `${value}:00${SEOUL_OFFSET}`;
  // 2월 30일처럼 없는 날짜는 Date가 다음 달로 넘기므로 되돌린 값이 같은지로 거릅니다.
  return Number.isNaN(Date.parse(iso)) || toSeoulInput(iso) !== value ? null : iso;
}

/** 지금 시각의 `datetime-local` 값(한국 시간, 분 단위). */
export function nowSeoulInput(now: number = Date.now()): string {
  return toSeoulInput(new Date(now).toISOString());
}
