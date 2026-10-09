import { CRELINK_API_PATHS, type OperatorSlotEventResponse, type SlotEventStatus } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '../../../components/admin/AdminShell';
import { SlotEventPeriodForm } from '../../../components/admin/SlotEventPeriodForm';
import { loadSignedIn } from '../../../lib/api/server';
import { formatDateTime, formatNumber } from '../../../lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '이벤트 · 운영자', robots: { index: false } };

const BASE = '/admin/slot-event';

/** 상태 배지는 광고 배너와 같은 공용 색 배지(`badge-positive`·`badge-warning`·`badge-muted`)를 씁니다(설계 `디자인 검토 의견` 7). */
const STATUS: Record<SlotEventStatus, { label: string; badge: string; description: string }> = {
  open: {
    label: '진행 중',
    badge: 'badge-positive',
    description: '지금 신청을 받고 있어요. 홈과 관리 화면에 안내가 보여요.',
  },
  scheduled: {
    label: '시작 전',
    badge: 'badge-warning',
    description: '시작 시각부터 신청을 받아요. 그 전에는 홈과 관리 화면에 안내가 보이지 않아요.',
  },
  ended: {
    label: '끝남',
    badge: 'badge-muted',
    description: '새 신청을 받지 않아요. 받은 보너스는 그대로이고, 홈과 관리 화면 안내는 숨었어요.',
  },
};

type Search = { page?: string | string[] };

const pageHref = (page: number) => (page > 1 ? `${BASE}?${new URLSearchParams({ page: String(page) })}` : BASE);

/**
 * 운영자 링크 슬롯 이벤트 화면(R24 ②③⑤, 디자인 design/slot-event/handoff.md `운영자 /admin/slot-event` D1~D13,
 * 설계 docs/specs/crelink-slot-event.md `화면 상태와 API 대응`). 기간·신청 수·신청자(최신순 20명씩)를 서버에서 읽고,
 * 기간 저장은 `SlotEventPeriodForm`이 맡습니다. API는 1 이상 정수가 아닌 `page`를 400으로 막으므로 잘못된 `?page=`는 1로 고쳐 부릅니다.
 */
export default async function AdminSlotEventPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const pageValue = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const result = await loadSignedIn<OperatorSlotEventResponse>(
    `${CRELINK_API_PATHS.adminSlotEvent}?${new URLSearchParams({ page: String(page) })}`,
  );

  return (
    <AdminShell
      error={result.ok ? null : result.error}
      errorTitle="이벤트를 불러오지 못했어요."
      retryHref={pageHref(page)}
    >
      {result.ok ? <SlotEvent data={result.data} /> : null}
    </AdminShell>
  );
}

function SlotEvent({ data }: { data: OperatorSlotEventResponse }) {
  const { event } = data;
  const status = STATUS[event.status];
  return (
    <>
      <div className="slot-event-head">
        <h1 className="page-title">외부 링크 +5 이벤트</h1>
        <p className="section-help">
          신청한 크리에이터는 보이는 외부 링크를 {event.bonusLinks}개 더 둘 수 있어요. 기간이 끝나면 새 신청만 막히고,
          받은 보너스는 그대로예요.
        </p>
      </div>

      <section className="card" aria-labelledby="slot-event-period-title">
        <div className="card-head">
          <h2 id="slot-event-period-title">이벤트 기간</h2>
          <span className={`badge ad-status ${status.badge}`}>{status.label}</span>
        </div>
        <p className="slot-event-state">{status.description}</p>
        <SlotEventPeriodForm startsAt={event.startsAt} endsAt={event.endsAt} />
      </section>

      <section className="card" aria-labelledby="slot-event-entries-title">
        <h2 id="slot-event-entries-title">신청자</h2>
        <dl className="stat-tiles slot-event-count">
          <div>
            <dt>신청 수</dt>
            <dd>{formatNumber(data.entryCount)}</dd>
          </div>
        </dl>
        <Entries data={data} />
      </section>
    </>
  );
}

function Entries({ data }: { data: OperatorSlotEventResponse }) {
  if (data.entryCount === 0) return <p className="empty-text">아직 신청한 크리에이터가 없어요.</p>;
  if (data.entries.length === 0)
    return (
      <p className="empty-text">
        이 쪽에는 신청자가 없어요. <Link href={BASE}>첫 쪽으로</Link>
      </p>
    );
  const pages = Math.max(1, Math.ceil(data.entryCount / data.pageSize));
  return (
    <>
      <p className="section-help">
        신청 시각이 최신인 순서예요. 전체 {formatNumber(data.entryCount)}명 · {data.page}/{pages}쪽
      </p>
      <div className="table-scroll slot-event-table-wrap">
        <table className="data-table slot-event-table">
          <caption className="visually-hidden">이벤트 신청자 목록</caption>
          <thead>
            <tr>
              <th scope="col">신청일시</th>
              <th scope="col">이메일</th>
              <th scope="col">이름</th>
              <th scope="col">단축 주소</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr key={entry.userId}>
                <td>
                  <time dateTime={entry.appliedAt}>{formatDateTime(entry.appliedAt)}</time>
                </td>
                <td>
                  <Link href={`/admin/creators/${encodeURIComponent(entry.userId)}`}>{entry.email}</Link>
                </td>
                <td>{entry.displayName ?? '—'}</td>
                <td>
                  <code>{entry.slug}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav className="pagination" aria-label="쪽 이동">
          {data.page > 1 ? <Link href={pageHref(data.page - 1)}>이전 쪽</Link> : <span aria-hidden="true" />}
          <span>
            {data.page} / {pages}
          </span>
          {data.page < pages ? <Link href={pageHref(data.page + 1)}>다음 쪽</Link> : <span aria-hidden="true" />}
        </nav>
      ) : null}
    </>
  );
}
