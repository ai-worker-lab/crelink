import { HttpStatus } from '@nestjs/common';
import { apiError, UUID_PATTERN } from './http';

/**
 * 최신순 keyset 목록의 커서(방명록·AI 실행 기록·운영자 행동 기록). 원문 `{epoch 마이크로초}.{행 id}`이고 밖에는 base64url로만 내보냅니다.
 * JS `Date`는 밀리초까지라 같은 밀리초의 행을 건너뛰지 않도록 DB 시각의 마이크로초를 그대로 씁니다.
 */
const CURSOR_PATTERN = /^(\d{1,16})\.([0-9a-f-]{36})$/;

export interface Cursor {
  /** epoch 마이크로초(정수 문자열). */
  at: string;
  id: string;
}

/** SELECT 목록에 넣는 커서 시각 식. 결과 컬럼(text)을 `encodeCursor`에 넘깁니다. */
export function cursorAtSql(column: string): string {
  return `(extract(epoch FROM ${column}) * 1000000)::bigint::text`;
}

/**
 * `(시각, id) < 커서` 조건. 커서가 없으면(첫 쪽, 두 파라미터 NULL) 참입니다.
 * 정수 마이크로초를 float8로 곱합니다. 2^53 미만 정수는 float8로 정확하므로 DB 값과 같은 시각이 됩니다.
 */
export function cursorBeforeSql(timeColumn: string, idColumn: string, atParam: number, idParam: number): string {
  return `($${atParam}::float8 IS NULL OR (${timeColumn}, ${idColumn}) < (timestamptz 'epoch' + $${atParam}::float8 * interval '1 microsecond', $${idParam}::uuid))`;
}

/** `?cursor=`. 없으면 null(첫 쪽), 해석할 수 없으면 400 `validation_failed`(message는 목록마다 다른 안내 문구). */
export function parseCursor(value: unknown, message: string): Cursor | null {
  if (value === undefined) return null;
  const invalid = apiError(HttpStatus.BAD_REQUEST, 'validation_failed', message);
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw invalid;
  const match = CURSOR_PATTERN.exec(Buffer.from(value, 'base64url').toString('utf8'));
  if (!match || !UUID_PATTERN.test(match[2])) throw invalid;
  return { at: match[1], id: match[2] };
}

/** `pageSize + 1`개를 읽은 결과를 한 쪽과 다음 커서로 나눕니다. 행에는 `cursor_at`(`cursorAtSql`)과 `id`가 있어야 합니다. */
export function cursorPage<Row extends { cursor_at: string; id: string }, Item>(
  rows: Row[],
  pageSize: number,
  view: (row: Row) => Item,
): { items: Item[]; nextCursor: string | null } {
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  return {
    items: page.map(view),
    nextCursor: rows.length > pageSize ? Buffer.from(`${last.cursor_at}.${last.id}`).toString('base64url') : null,
  };
}
