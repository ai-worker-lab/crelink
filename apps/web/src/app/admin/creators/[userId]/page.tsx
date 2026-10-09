import {
  CRELINK_API_PATHS,
  type CountByValue,
  type OperatorCreatorDetail,
  type OperatorCreatorStats,
} from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '../../../../components/admin/AdminShell';
import {
  BannerSlotControl,
  BlockControl,
  ExtraSlotsForm,
  SuspensionToggle,
} from '../../../../components/admin/CreatorControls';
import { RemoteImage } from '../../../../components/RemoteImage';
import { loadSignedIn, type ServerApiResult } from '../../../../lib/api/server';
import { formatDate, formatNumber, recentRange } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '크리에이터 상세 · 운영자', robots: { index: false } };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PRESETS = [7, 30, 90] as const;

type Props = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
};

export default async function AdminCreatorPage({ params, searchParams }: Props) {
  const { userId } = await params;
  const search = await searchParams;
  const fallback = recentRange(30);
  const pick = (value: string | string[] | undefined, otherwise: string) => {
    const single = Array.isArray(value) ? value[0] : value;
    return single && DAY_PATTERN.test(single) ? single : otherwise;
  };
  const from = pick(search.from, fallback.from);
  const to = pick(search.to, fallback.to);
  const [detail, stats] = await Promise.all([
    loadSignedIn<OperatorCreatorDetail>(CRELINK_API_PATHS.adminCreator(userId)),
    loadSignedIn<OperatorCreatorStats>(
      `${CRELINK_API_PATHS.adminCreatorStats(userId)}?${new URLSearchParams({ from, to })}`,
    ),
  ]);

  return (
    <AdminShell error={detail.ok ? null : detail.error}>
      {detail.ok ? <CreatorDetail creator={detail.data} stats={stats} from={from} to={to} /> : null}
    </AdminShell>
  );
}

function CreatorDetail({
  creator,
  stats,
  from,
  to,
}: {
  creator: OperatorCreatorDetail;
  stats: ServerApiResult<OperatorCreatorStats>;
  from: string;
  to: string;
}) {
  const base = `/admin/creators/${encodeURIComponent(creator.userId)}`;
  return (
    <>
      <p className="breadcrumb">
        <Link href="/admin">크리에이터 목록</Link>
      </p>
      <h1 className="page-title">{creator.displayName ?? creator.email}</h1>
      <dl className="meta-list">
        <div>
          <dt>이메일</dt>
          <dd>{creator.email}</dd>
        </div>
        <div>
          <dt>단축 주소</dt>
          <dd>
            <a className="url-text" href={creator.shortUrl} target="_blank" rel="noopener">
              {creator.shortUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt>랜딩페이지</dt>
          <dd>
            <a className="url-text" href={creator.landingUrl} target="_blank" rel="noopener">
              {creator.landingUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt>가입일</dt>
          <dd>{formatDate(creator.createdAt)}</dd>
        </div>
        <div>
          <dt>상태</dt>
          <dd>{creator.suspended ? <span className="badge badge-danger">정지</span> : '이용 중'}</dd>
        </div>
      </dl>

      <section className="card" aria-labelledby="account-title">
        <h2 id="account-title">계정 관리</h2>
        <p className="section-help">
          보이는 링크 {creator.limits.visibleUsed}/{creator.limits.visibleMax} · 전체 링크 {creator.limits.totalUsed}/
          {creator.limits.totalMax}
        </p>
        <div className="control-grid">
          <ExtraSlotsForm userId={creator.userId} extraSlots={creator.extraLinkSlots} />
          <SuspensionToggle userId={creator.userId} suspended={creator.suspended} />
          <BannerSlotControl
            userId={creator.userId}
            grantedAt={creator.bannerSlot.grantedAt}
            limits={creator.bannerLimits}
            bannerCount={creator.banners.length}
          />
        </div>
      </section>

      <section className="card" aria-labelledby="stats-title">
        <h2 id="stats-title">접근 통계</h2>
        <form className="period-form" action={base} method="get">
          <div className="field">
            <label htmlFor="stats-from">시작일</label>
            <input id="stats-from" className="input" type="date" name="from" defaultValue={from} required />
          </div>
          <div className="field">
            <label htmlFor="stats-to">종료일</label>
            <input id="stats-to" className="input" type="date" name="to" defaultValue={to} required />
          </div>
          <button type="submit" className="primary">
            조회
          </button>
        </form>
        <p className="preset-links">
          {PRESETS.map((days) => {
            const range = recentRange(days);
            return (
              <Link key={days} href={`${base}?${new URLSearchParams(range)}`}>
                최근 {days}일
              </Link>
            );
          })}
        </p>
        {stats.ok ? (
          <Stats stats={stats.data} />
        ) : (
          <p className="form-error" role="alert">
            {stats.error.message}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="links-title">
        <h2 id="links-title">링크</h2>
        {creator.links.length === 0 ? (
          <p className="empty-text">등록한 링크가 없어요.</p>
        ) : (
          <ul className="edit-list">
            {creator.links.map((link) => (
              <li key={link.id} className={`item-card${link.blocked ? ' item-blocked' : ''}`}>
                <div className="item-body">
                  <div className="item-text">
                    <h3 className="item-title">{link.title}</h3>
                    <p className="url-text">{link.url}</p>
                    <p className="badges">
                      {link.hidden ? <span className="badge">숨김</span> : null}
                      {link.blocked ? <span className="badge badge-danger">차단됨</span> : null}
                    </p>
                  </div>
                  <BlockControl
                    blocked={link.blocked}
                    blockedReason={link.blockedReason}
                    path={CRELINK_API_PATHS.adminLinkBlock(link.id)}
                    noun="링크"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="banners-title">
        <h2 id="banners-title">배너</h2>
        {creator.banners.length === 0 ? (
          <p className="empty-text">만든 배너가 없어요.</p>
        ) : (
          <ul className="edit-list">
            {creator.banners.map((banner) => (
              <li key={banner.id} className={`item-card${banner.blocked ? ' item-blocked' : ''}`}>
                <div className="item-body">
                  <RemoteImage
                    className="item-thumb item-thumb-banner"
                    src={banner.image.url}
                    alt=""
                    width={120}
                    height={40}
                    loading="lazy"
                  />
                  <div className="item-text">
                    <h3 className="item-title">{banner.alt}</h3>
                    {banner.url ? (
                      <p className="url-text">{banner.url}</p>
                    ) : (
                      <p className="item-description">연결 없음</p>
                    )}
                    <p className="badges">
                      {banner.hidden ? <span className="badge">숨김</span> : null}
                      {banner.blocked ? <span className="badge badge-danger">차단됨</span> : null}
                    </p>
                  </div>
                  <BlockControl
                    blocked={banner.blocked}
                    blockedReason={banner.blockedReason}
                    path={CRELINK_API_PATHS.adminBannerBlock(banner.id)}
                    noun="배너"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stats({ stats }: { stats: OperatorCreatorStats }) {
  return (
    <div className="stats">
      <p className="section-help">
        {formatDate(`${stats.from}T00:00:00+09:00`)} ~ {formatDate(`${stats.to}T00:00:00+09:00`)}
      </p>
      <dl className="stat-tiles">
        <div>
          <dt>방문</dt>
          <dd>{formatNumber(stats.totals.visits)}</dd>
        </div>
        <div>
          <dt>순 방문자</dt>
          <dd>{formatNumber(stats.totals.uniqueVisitors)}</dd>
        </div>
        <div>
          <dt>링크 클릭</dt>
          <dd>{formatNumber(stats.totals.linkClicks)}</dd>
        </div>
      </dl>

      <h3>일별 추이</h3>
      {stats.daily.length === 0 ? (
        <p className="empty-text">이 기간에 기록이 없어요.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <caption className="visually-hidden">일별 방문·순 방문자·링크 클릭</caption>
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col" className="num">
                  방문
                </th>
                <th scope="col" className="num">
                  순 방문자
                </th>
                <th scope="col" className="num">
                  링크 클릭
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.daily.map((day) => (
                <tr key={day.day}>
                  <th scope="row">{day.day}</th>
                  <td className="num">{formatNumber(day.visits)}</td>
                  <td className="num">{formatNumber(day.uniqueVisitors)}</td>
                  <td className="num">{formatNumber(day.linkClicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>분포</h3>
      <div className="distribution-grid">
        <Distribution title="유입 경로" rows={stats.referrers} emptyValue="직접 방문·알 수 없음" />
        <Distribution title="기기" rows={stats.devices} />
        <Distribution title="브라우저" rows={stats.browsers} />
        <Distribution title="운영체제" rows={stats.operatingSystems} />
        <Distribution title="국가" rows={stats.countries} />
      </div>

      <h3>링크별 클릭</h3>
      {stats.linkClicks.length === 0 ? (
        <p className="empty-text">이 기간에 링크 클릭이 없어요.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <caption className="visually-hidden">링크별 클릭 수</caption>
            <thead>
              <tr>
                <th scope="col">링크</th>
                <th scope="col" className="num">
                  클릭
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.linkClicks.map((row) => (
                <tr key={row.linkId}>
                  <th scope="row">{row.title ?? '(지운 링크)'}</th>
                  <td className="num">{formatNumber(row.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>배너별 클릭</h3>
      {stats.bannerClicks.length === 0 ? (
        <p className="empty-text">이 기간에 배너 클릭이 없어요.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <caption className="visually-hidden">배너별 클릭 수</caption>
            <thead>
              <tr>
                <th scope="col">배너</th>
                <th scope="col" className="num">
                  클릭
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.bannerClicks.map((row) => (
                <tr key={row.bannerId}>
                  <th scope="row">{row.alt ?? '(지운 배너)'}</th>
                  <td className="num">{formatNumber(row.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Distribution({
  title,
  rows,
  emptyValue = '알 수 없음',
}: {
  title: string;
  rows: CountByValue[];
  emptyValue?: string;
}) {
  return (
    <div className="distribution">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="empty-text">기록 없음</p>
      ) : (
        <table className="data-table compact">
          <caption className="visually-hidden">{title}별 방문 수</caption>
          <thead>
            <tr>
              <th scope="col">값</th>
              <th scope="col" className="num">
                수
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value}>
                <th scope="row">{row.value || emptyValue}</th>
                <td className="num">{formatNumber(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
