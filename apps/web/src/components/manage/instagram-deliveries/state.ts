import type { InstagramDmDeliveryStatus, InstagramDmDeliveryView } from '@crelink/shared';

export interface DeliveryPage {
  items: InstagramDmDeliveryView[];
  nextCursor: string | null;
}

const STATUS_LABELS: Record<InstagramDmDeliveryStatus, string> = {
  pending: '대기',
  sending: '대기',
  sent: '보냄',
  failed: '실패',
  unknown: '확인 필요',
  expired: '시간 초과',
  cancelled: '취소',
};

export function deliveryStatusLabel(status: InstagramDmDeliveryStatus): string {
  return STATUS_LABELS[status];
}

/** 필터를 바꾸면 커서를 비우고, 더 보기에서는 같은 규칙 필터를 유지합니다. */
export function deliveryQuery(rule: string, cursor: string | null): string {
  const query = new URLSearchParams();
  if (rule) query.set('rule', rule);
  if (cursor) query.set('cursor', cursor);
  return query.size ? `?${query}` : '';
}

/** 내역을 읽는 사이 데이터가 바뀌어도 같은 행은 한 번만 표시합니다. */
export function appendDeliveries(
  current: InstagramDmDeliveryView[],
  incoming: InstagramDmDeliveryView[],
): InstagramDmDeliveryView[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}
