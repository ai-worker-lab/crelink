import { HttpStatus } from '@nestjs/common';
import { ANALYTICS_LIMITS } from '@crelink/shared';
import { apiError } from '../common/http';
import { STATS_TIME_ZONE } from '../retention/retention.service';

const DAY_MS = 24 * 60 * 60 * 1000;
function parseDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : time;
}

export function analyticsRange(fromInput: unknown, toInput: unknown): { from: string; to: string; days: string[] } {
  const today = Date.parse(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE }).format(new Date())}T00:00:00Z`,
  );
  const to = toInput === undefined ? today : parseDay(toInput);
  const from =
    fromInput === undefined && to !== null
      ? to - (ANALYTICS_LIMITS.defaultRangeDays - 1) * DAY_MS
      : parseDay(fromInput);
  if (from === null || to === null || from > to || (to - from) / DAY_MS + 1 > ANALYTICS_LIMITS.maxRangeDays) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'date_range_invalid',
      `기간은 YYYY-MM-DD 형식으로, 시작일이 종료일보다 늦지 않게 최대 ${ANALYTICS_LIMITS.maxRangeDays}일까지 선택해 주세요.`,
    );
  }
  const days: string[] = [];
  for (let time = from; time <= to; time += DAY_MS) days.push(new Date(time).toISOString().slice(0, 10));
  return { from: days[0], to: days[days.length - 1], days };
}
