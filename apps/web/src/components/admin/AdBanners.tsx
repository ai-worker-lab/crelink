'use client';

import {
  CRELINK_API_PATHS,
  type AdBannerListResponse,
  type AdBannerStatus,
  type AdBannerView,
  type ReorderRequest,
} from '@crelink/shared';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { browserApi } from '../../lib/api/browser';
import { formatDateTime, formatNumber } from '../../lib/format';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { RemoteImage } from '../RemoteImage';
import { AdBannerDialog } from './AdBannerDialog';

type Filter = 'all' | AdBannerStatus;

const FILTERS: ReadonlyArray<{ value: Filter; label: string; empty: string }> = [
  { value: 'all', label: '전체', empty: '등록한 광고 배너가 없어요.' },
  { value: 'live', label: '게시 중', empty: '게시 중인 배너가 없어요.' },
  { value: 'scheduled', label: '예약', empty: '예약된 배너가 없어요.' },
  { value: 'ended', label: '끝남', empty: '끝난 배너가 없어요.' },
];

const STATUS_LABELS: Record<AdBannerStatus, string> = { live: '게시 중', scheduled: '예약', ended: '끝남' };
const STATUS_BADGES: Record<AdBannerStatus, string> = {
  live: 'badge badge-positive',
  scheduled: 'badge badge-warning',
  ended: 'badge badge-muted',
};

/** 끄는 동안 행이 세로로만 움직이게 합니다. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** 대화상자 상태: 닫힘, 새 배너, 이 배너 수정. */
type Editing = { banner: AdBannerView | null } | null;

/**
 * 운영자 `광고 배너` 화면(R20 ④⑧⑨, 디자인 design/ad-banner-block/handoff.md `광고 배너`, 설계 docs/specs/crelink-ad-banner.md
 * `화면 상태와 API 대응`). 서버가 그린 전체 목록(`AdBannerListResponse`, 순서대로)을 받아 `item.status`로 걸러 봅니다.
 *
 * - 1280px은 표, 700px 이하는 같은 표를 CSS로 카드처럼 그립니다(목록을 하나만 그려 dnd-kit id가 겹치지 않음).
 * - 순서는 `전체`에서만 손잡이(끌기·키보드)로 바꾸고 바로 `PUT …/order`(전체 id)로 저장합니다. 실패하면 되돌립니다.
 * - `내리기`는 확인 뒤 `PUT …/{id}/end`, 등록·수정은 `AdBannerDialog`. 바꾼 뒤에는 서버 화면을 다시 읽습니다(상태·수 갱신).
 */
export function AdBanners({ list }: { list: AdBannerListResponse }) {
  const router = useRouter();
  const dndId = useId();
  const { pending, error, notice, run, setError, setNotice } = useAction();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Editing>(null);
  /** 대화상자를 닫은 뒤 초점을 돌려줄 버튼. */
  const opener = useRef<HTMLElement | null>(null);
  /** 이번 끌기에서 한 번이라도 다른 자리로 옮겼는지(스크린리더 안내용). */
  const movedSinceStart = useRef(false);
  // 정렬은 화면에서 먼저 바꾸고 저장하므로 목록을 상태로 두고, 서버가 새 목록을 주면(새로 읽기) 그 값으로 맞춥니다.
  const [items, setItems] = useState(list.items);
  const [source, setSource] = useState(list.items);
  if (source !== list.items) {
    setSource(list.items);
    setItems(list.items);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortable = filter === 'all';
  const shown = sortable ? items : items.filter((item) => item.status === filter);
  const ids = items.map((item) => item.id);
  const { counts } = list;

  function openDialog(banner: AdBannerView | null, from: HTMLElement) {
    opener.current = from;
    setError(null);
    setNotice(null);
    setEditing({ banner });
  }

  function closeDialog() {
    setEditing(null);
    // 대화상자가 닫히고(다시 그린 뒤) 연 버튼으로 초점을 돌려줍니다.
    requestAnimationFrame(() => opener.current?.focus());
  }

  function saved(banner: AdBannerView, created: boolean) {
    closeDialog();
    setError(null);
    setNotice(
      created ? `'${banner.alt}' 배너를 등록했어요. 목록 맨 뒤에 들어가요.` : `'${banner.alt}' 배너를 저장했어요.`,
    );
    router.refresh();
  }

  async function end(banner: AdBannerView) {
    if (!window.confirm('이 배너를 내릴까요? 게시 끝을 지금으로 바꿔 모든 랜딩에서 바로 빠져요.')) return;
    await run(async () => {
      await browserApi<AdBannerView>(CRELINK_API_PATHS.adminAdBannerEnd(banner.id), { method: 'PUT' });
      router.refresh();
    }, `'${banner.alt}' 배너를 내렸어요.`);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const before = items;
    const next = arrayMove(items, from, to);
    setItems(next);
    const payload: ReorderRequest = { ids: next.map((item) => item.id) };
    const ok = await run(
      async () => {
        setItems(
          await browserApi<AdBannerView[]>(CRELINK_API_PATHS.adminAdBannersOrder, {
            method: 'PUT',
            body: JSON.stringify(payload),
          }),
        );
      },
      `${before[from]?.alt ?? ''} 배너를 ${to + 1}번째로 옮겼어요.`,
    );
    if (!ok) setItems(before);
  }

  const nameOf = (id: UniqueIdentifier) => `${items.find((item) => item.id === id)?.alt ?? ''} 배너`;
  const positionOf = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      movedSinceStart.current = false;
      return `${nameOf(active.id)}를 들었어요. 지금 ${positionOf(active.id)}번째, 전체 ${ids.length}개예요.`;
    },
    onDragOver: ({ active, over }) => {
      // 든 직후 제자리 위에 있다는 안내가 '들었어요' 안내를 덮지 않게 건너뜁니다.
      if (over?.id === active.id && !movedSinceStart.current) return undefined;
      movedSinceStart.current = true;
      return over
        ? `${nameOf(active.id)}를 ${positionOf(over.id)}번째 자리로 옮기고 있어요.`
        : `${nameOf(active.id)}가 목록 밖에 있어요.`;
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)}를 ${positionOf(over.id)}번째 자리에 놓았어요.`
        : `${nameOf(active.id)}를 제자리에 놓았어요.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} 옮기기를 취소했어요. 원래 자리로 돌아갔어요.`,
  };

  const emptyText = FILTERS.find((item) => item.value === filter)?.empty ?? '';
  return (
    <>
      <div className="ad-banners-head">
        <div>
          <h1 className="page-title">광고 배너</h1>
          <p className="section-help">
            게시 중인 배너는 배너 슬롯이 없는 모든 랜딩의 광고 블록에 나와요. 여러 장이면 아래 순서대로 넘겨 봐요.
          </p>
        </div>
        <button type="button" className="primary" onClick={(event) => openDialog(null, event.currentTarget)}>
          배너 등록
        </button>
      </div>
      {counts.live === 0 ? (
        <p className="notice-box ad-banners-warning">
          지금 게시 중인 배너가 없어 모든 랜딩에서 광고 블록이 숨어 있어요.
        </p>
      ) : null}
      <div className="filter-chips" role="group" aria-label="상태로 걸러 보기">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className="filter-chip"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label} <span className="ad-banners-count">{formatNumber(counts[item.value])}</span>
          </button>
        ))}
      </div>
      <p className="section-help">
        노출은 방문자가 랜딩을 열었을 때 첫 장 기준으로 세요. 크리링 안에서 연 화면은 세지 않아요.
        {sortable && items.length > 1 ? ' 손잡이를 끌거나 키보드로 순서를 바꾸면 바로 저장돼요.' : ''}
        {!sortable && items.length > 1 ? ' 순서는 전체에서 바꿀 수 있어요.' : ''}
      </p>
      <ActionStatus error={error} notice={notice} />
      {shown.length === 0 ? (
        <p className="empty-text ad-banners-empty">{emptyText}</p>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                '순서를 바꾸려면 스페이스 키나 엔터 키로 배너를 든 뒤 위·아래 화살표 키로 옮기고, 스페이스 키나 엔터 키로 내려놓으세요. Esc 키를 누르면 취소돼요.',
            },
          }}
        >
          <SortableContext items={sortable ? ids : []} strategy={verticalListSortingStrategy}>
            <div className="table-scroll is-stacked">
              <table className={`data-table is-stacked ad-banners-table${sortable ? ' is-sortable' : ''}`}>
                <caption className="visually-hidden">광고 배너 목록</caption>
                <thead>
                  <tr>
                    {sortable ? (
                      <th scope="col" className="ad-col-handle">
                        <span className="visually-hidden">순서</span>
                      </th>
                    ) : null}
                    <th scope="col">이미지</th>
                    <th scope="col">대체 문구</th>
                    <th scope="col">연결 URL</th>
                    <th scope="col">게시 기간</th>
                    <th scope="col">상태</th>
                    <th scope="col" className="num">
                      노출
                    </th>
                    <th scope="col" className="num">
                      클릭
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">행동</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((banner) => (
                    <AdBannerRow
                      key={banner.id}
                      banner={banner}
                      sortable={sortable}
                      busy={pending}
                      onEdit={(from) => openDialog(banner, from)}
                      onEnd={() => end(banner)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </SortableContext>
        </DndContext>
      )}
      {editing ? (
        <AdBannerDialog
          banner={editing.banner}
          onDismiss={closeDialog}
          onSaved={(banner) => saved(banner, editing.banner === null)}
        />
      ) : null}
    </>
  );
}

/** 표의 한 행(700px 이하는 카드). `sortable`이면 첫 칸에 끌기 손잡이를 둡니다. */
function AdBannerRow({
  banner,
  sortable,
  busy,
  onEdit,
  onEnd,
}: {
  banner: AdBannerView;
  sortable: boolean;
  /** 저장 요청(순서·내리기)이 진행 중이면 끌기와 버튼을 막습니다. */
  busy: boolean;
  onEdit: (from: HTMLElement) => void;
  onEnd: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: banner.id,
    disabled: busy || !sortable,
    attributes: { roleDescription: '순서를 바꿀 수 있는 배너' },
  });
  // 표에서는 움직이는 이미지가 되풀이되지 않게 정지 이미지가 있으면 그것을 보여 줍니다.
  const thumbnail = banner.stillImage ?? banner.image;
  return (
    <tr
      ref={setNodeRef}
      className={`ad-banner-row${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {sortable ? (
        <td className="ad-col-handle">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="drag-handle"
            {...attributes}
            {...listeners}
            aria-label={`${banner.alt} 순서 바꾸기`}
          >
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M7 4h2v2H7zm4 0h2v2h-2zM7 9h2v2H7zm4 0h2v2h-2zm-4 5h2v2H7zm4 0h2v2h-2z" fill="currentColor" />
            </svg>
          </button>
        </td>
      ) : null}
      <td className="ad-col-thumb">
        <RemoteImage className="ad-banner-thumb" src={thumbnail.url} alt="" width={120} height={40} loading="lazy" />
      </td>
      <th scope="row" className="ad-col-alt">
        {banner.alt}
      </th>
      <td className="ad-col-url">
        <span className="url-text">{banner.url}</span>
      </td>
      <td className="ad-col-period">
        <span className="ad-period">{formatDateTime(banner.startsAt)}</span>{' '}
        <span className="ad-period">~ {banner.endsAt ? formatDateTime(banner.endsAt) : '내릴 때까지'}</span>
      </td>
      <td className="ad-col-status">
        <span className={`${STATUS_BADGES[banner.status]} ad-status`}>{STATUS_LABELS[banner.status]}</span>
      </td>
      <td className="num ad-col-stat">
        <span className="stacked-label">노출 </span>
        {formatNumber(banner.impressions)}
      </td>
      <td className="num ad-col-stat ad-col-clicks">
        <span className="stacked-label">클릭 </span>
        {formatNumber(banner.clicks)}
      </td>
      <td className="ad-col-actions">
        <div className="ad-banner-actions">
          <button
            type="button"
            className="secondary"
            aria-label={`${banner.alt} 수정`}
            disabled={busy}
            onClick={(event) => onEdit(event.currentTarget)}
          >
            수정
          </button>
          {banner.status === 'ended' ? null : (
            <button
              type="button"
              className="secondary danger"
              aria-label={`${banner.alt} 내리기`}
              disabled={busy}
              onClick={onEnd}
            >
              내리기
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
