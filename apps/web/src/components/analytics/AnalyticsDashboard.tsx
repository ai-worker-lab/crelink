import {
  ANALYTICS_LIMITS,
  type AnalyticsDaily,
  type AnalyticsReport,
  type AnalyticsTarget,
  type CountByValue,
} from '@crelink/shared';
import Link from 'next/link';
import {
  ANALYTICS_TARGET_LABELS,
  analyticsCount,
  analyticsDimension,
  analyticsDuration,
  analyticsHref,
  analyticsPercent,
  type AnalyticsFilters,
} from '../../lib/analytics';
import { formatDateTime, formatNumber, recentRange } from '../../lib/format';

export type AnalyticsMode = 'metrics' | 'stats';
export type CreatorOption = { id: string; label: string };

export function AnalyticsFiltersForm({
  base,
  filters,
  creators,
  creatorPages = 1,
  creatorError,
}: {
  base: string;
  filters: AnalyticsFilters;
  creators?: CreatorOption[];
  creatorPages?: number;
  creatorError?: string;
}) {
  return (
    <section className="card analytics-filters" aria-label="조회 조건">
      <form key={analyticsHref(base, filters)} className="period-form" action={base} method="get">
        <div className="field">
          <label htmlFor="analytics-from">시작일</label>
          <input id="analytics-from" className="input" name="from" type="date" defaultValue={filters.from} required />
        </div>
        <div className="field">
          <label htmlFor="analytics-to">종료일</label>
          <input id="analytics-to" className="input" name="to" type="date" defaultValue={filters.to} required />
        </div>
        {creators ? (
          <>
            <div className="field">
              <label htmlFor="analytics-creator">크리에이터</label>
              <div className="analytics-select">
                <select id="analytics-creator" className="input" name="creatorId" defaultValue={filters.creatorId}>
                  <option value="">전체 서비스</option>
                  {creators.map((creator) => (
                    <option key={creator.id} value={creator.id}>
                      {creator.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input type="hidden" name="creatorQuery" value={filters.creatorQuery} />
            <input type="hidden" name="creatorPage" value={filters.creatorPage} />
            <label className="check-field analytics-checkbox">
              <input type="checkbox" name="includeExcluded" value="1" defaultChecked={filters.includeExcluded} />
              시험 계정 포함 <span className="field-help">(전체 서비스 조회)</span>
            </label>
          </>
        ) : null}
        <button className="primary" type="submit">
          조회
        </button>
      </form>
      <p className="field-help">한국 시간 기준 · 시작일과 종료일 포함 · 최대 {ANALYTICS_LIMITS.maxRangeDays}일</p>
      <nav className="preset-links" aria-label="빠른 기간 선택">
        {[7, 30, 90].map((days) => {
          const range = recentRange(days);
          return (
            <Link
              key={days}
              className="secondary"
              href={analyticsHref(base, filters, range)}
              aria-current={filters.from === range.from && filters.to === range.to ? 'date' : undefined}
            >
              최근 {days}일
            </Link>
          );
        })}
      </nav>
      {creators ? (
        <details className="analytics-creator-search" open={Boolean(filters.creatorQuery) || filters.creatorPage > 1}>
          <summary>크리에이터 선택 목록 검색</summary>
          <form key={filters.creatorQuery} className="search-form" action={base} method="get" role="search">
            <input type="hidden" name="from" value={filters.from} />
            <input type="hidden" name="to" value={filters.to} />
            {filters.creatorId ? <input type="hidden" name="creatorId" value={filters.creatorId} /> : null}
            {filters.includeExcluded ? <input type="hidden" name="includeExcluded" value="1" /> : null}
            <label htmlFor="analytics-creator-query">이름·이메일·단축 주소</label>
            <div className="inline-fields">
              <input
                id="analytics-creator-query"
                className="input"
                name="creatorQuery"
                type="search"
                maxLength={100}
                defaultValue={filters.creatorQuery}
              />
              <button className="secondary" type="submit">
                목록 검색
              </button>
            </div>
          </form>
          {creatorError ? (
            <p className="form-error" role="alert">
              선택 목록을 불러오지 못했어요. {creatorError}
            </p>
          ) : (
            <p className="field-help">검색한 뒤 위 목록에서 크리에이터를 선택하고 조회해 주세요.</p>
          )}
          <nav className="pagination" aria-label="크리에이터 선택 목록 쪽 이동">
            {filters.creatorPage > 1 ? (
              <Link href={analyticsHref(base, filters, { creatorPage: filters.creatorPage - 1 })}>이전 목록</Link>
            ) : (
              <span />
            )}
            <span>
              {filters.creatorPage} / {Math.max(1, creatorPages)}쪽
            </span>
            {filters.creatorPage < creatorPages ? (
              <Link href={analyticsHref(base, filters, { creatorPage: filters.creatorPage + 1 })}>다음 목록</Link>
            ) : (
              <span />
            )}
          </nav>
        </details>
      ) : null}
    </section>
  );
}

export function AnalyticsDashboard({ report, mode }: { report: AnalyticsReport; mode: AnalyticsMode }) {
  const summary = report.summary;
  return (
    <>
      {mode === 'metrics' ? (
        <section className="card" aria-labelledby="analytics-summary-title">
          <h2 id="analytics-summary-title">방문자 행동 요약</h2>
          <dl className="stat-tiles analytics-tiles">
            <Tile title="수집된 페이지뷰" value={analyticsCount(summary.pageViews)} />
            <Tile title="익명 순 방문자" value={analyticsCount(summary.uniqueVisitors)} />
            <Tile title="세션" value={analyticsCount(summary.sessions)} />
            <Tile title="클릭" value={analyticsCount(summary.clicks)} />
            <Tile title="가시 노출" value={analyticsCount(summary.impressions)} />
            <Tile title="클릭한 페이지뷰 비율" value={analyticsPercent(summary.clickThroughRate)} />
            <Tile title="평균 활성 체류" value={analyticsDuration(summary.averageActiveMs)} />
            <Tile title="누적 활성 체류" value={analyticsDuration(summary.activeMs)} />
          </dl>
          <p className="field-help">
            클릭한 페이지뷰 비율은 한 번 이상 클릭한 페이지뷰 ÷ 페이지뷰예요. 클릭 횟수 ÷ 페이지뷰와 달라요. 체류·비율은
            페이지뷰 시작일 기준이에요.
          </p>
          {summary.uniqueVisitors === null || summary.sessions === null ? (
            <p className="section-help">
              보존 집계의 일별·페이지별 합: 순 방문자 {formatNumber(summary.dailyPageUniqueVisitors)} · 세션{' '}
              {formatNumber(summary.dailyPageSessions)}. 기간 전체의 중복을 제거한 수가 아니에요.
            </p>
          ) : null}
        </section>
      ) : null}
      <details className="analytics-coverage notice-box">
        <summary>집계 기준·자료 범위 보기</summary>
        <p>
          <strong>
            {report.from} ~ {report.to}
          </strong>{' '}
          · 한국 시간 · 조회 {formatDateTime(report.generatedAt)}
        </p>
        <p>브라우저가 보낸 페이지 표시·행동 자료예요. 단축 주소 방문·리디렉트 클릭과 합산하지 않아요.</p>
        <p className="field-help">
          첫 관측 자료일 {report.coverage.firstRecordedDay ?? '아직 없음'} · 실제 계측 시작일을 뜻하지 않아요.
          {report.coverage.firstRecordedDay && report.from < report.coverage.firstRecordedDay
            ? ' 첫 관측 자료일 이전 날짜가 포함돼 그 기간의 0을 방문 없음으로 단정할 수 없어요.'
            : ''}
          {report.coverage.includesRollups
            ? ' 과거 보존 집계가 포함돼 기간 전체의 정확한 순 방문자·세션·클릭 비율 일부는 확인할 수 없어요.'
            : ''}
          {report.coverage.hasMissingDimensions ? ' 보존된 자료에 없던 세부분포는 알 수 없음에 포함돼요.' : ''} 원본
          보존 기준일 {report.coverage.rawFrom}. 분포는 남아 있는 원본과 보존 집계 기준이에요.
        </p>
      </details>
      {report.coverage.includesRollups ||
      (report.coverage.firstRecordedDay && report.from < report.coverage.firstRecordedDay) ? (
        <p className="field-help">
          수집 이전 기간이나 보존 집계가 포함돼요. 0을 방문 없음으로 단정할 수 없고 일부 수치는 확인 불가예요. 집계
          기준을 확인해 주세요.
        </p>
      ) : null}
      {summary.pageViews === 0 ? (
        <p className="notice-box" role="status">
          {report.legacy.visits > 0
            ? '이 기간에 단축 주소 방문은 있지만 브라우저 행동 수집 자료가 없어요. 수집 이전이거나 브라우저가 전송을 차단했을 수 있어요.'
            : '이 기간에 수집된 페이지 표시가 없어요. 방문이 없거나 수집 이전·전송 차단일 수 있어요.'}
        </p>
      ) : null}
      <section className="card" aria-labelledby="analytics-daily-title">
        <h2 id="analytics-daily-title">일별 추이</h2>
        <DailyTrend daily={report.daily} />
        {mode === 'metrics' ? (
          <details className="analytics-table-details">
            <summary>일별 데이터 표 보기</summary>
            <DailyTables daily={report.daily} />
          </details>
        ) : (
          <DailyTables daily={report.daily} />
        )}
      </section>
      {mode === 'stats' ? (
        <>
          <section className="card" aria-labelledby="analytics-target-title">
            <h2 id="analytics-target-title">대상별 클릭·노출</h2>
            <p className="field-help">
              대상 전환율은 노출된 페이지뷰·대상 중 이후 같은 페이지뷰에서 클릭된 비율이에요. 클릭·노출 수량은 발생일,
              전환율은 노출일 기준이에요. 클릭·노출 순 상위 {ANALYTICS_LIMITS.targets}개를 보여줘요.
            </p>
            <TargetTable rows={report.targets} />
          </section>
          <section className="card" aria-labelledby="analytics-scroll-title">
            <h2 id="analytics-scroll-title">스크롤 도달</h2>
            <dl className="stat-tiles analytics-tiles">
              {[25, 50, 75, 100].map((level) => (
                <Tile
                  key={level}
                  title={`${level}% 도달 페이지뷰`}
                  value={analyticsCount(
                    summary[`scroll${level}` as 'scroll25' | 'scroll50' | 'scroll75' | 'scroll100'],
                  )}
                />
              ))}
            </dl>
            <p className="field-help">
              문서 높이 대비 화면 아래 끝까지 본 최대 비율이에요. 짧은 페이지는 처음부터 100%일 수 있어요. 확인 불가는
              과거 집계에 도달 수가 남아 있지 않은 경우예요.
            </p>
          </section>
          <section className="card" aria-labelledby="analytics-sources-title">
            <h2 id="analytics-sources-title">유입·캠페인</h2>
            <p className="field-help">
              분포는 페이지뷰 기준이며 상위 {ANALYTICS_LIMITS.breakdownValues}개 뒤 나머지는 기타로 묶어요. 값이
              전달되지 않았거나 복원할 수 없으면 알 수 없음이에요.
            </p>
            <div className="distribution-grid analytics-distributions">
              <Distribution title="유입 사이트" rows={report.breakdowns.referrers} />
              <Distribution title="UTM 소스" rows={report.breakdowns.utm.source} />
              <Distribution title="UTM 매체" rows={report.breakdowns.utm.medium} />
              <Distribution title="UTM 캠페인" rows={report.breakdowns.utm.campaign} />
            </div>
            <details className="analytics-table-details">
              <summary>캠페인 상세 값</summary>
              <div className="distribution-grid analytics-distributions">
                <Distribution title="UTM ID" rows={report.breakdowns.utm.id} />
                <Distribution title="UTM 검색어" rows={report.breakdowns.utm.term} />
                <Distribution title="UTM 콘텐츠" rows={report.breakdowns.utm.content} />
              </div>
            </details>
          </section>
          <section className="card" aria-labelledby="analytics-environment-title">
            <h2 id="analytics-environment-title">지역·기기·환경</h2>
            <p className="field-help">
              지역은 IP 기반 추정이고 정확한 위치가 아니에요. 환경·언어는 브라우저 보고 값이에요.
            </p>
            <div className="distribution-grid analytics-distributions">
              <Distribution title="국가" rows={report.breakdowns.countries} />
              <Distribution title="도시" rows={report.breakdowns.cities} />
              <Distribution title="기기" rows={report.breakdowns.devices} />
              <Distribution title="브라우저" rows={report.breakdowns.browsers} />
              <Distribution title="운영체제" rows={report.breakdowns.operatingSystems} />
              <Distribution title="언어" rows={report.breakdowns.languages} />
            </div>
            <details className="analytics-table-details">
              <summary>화면·시간대 상세</summary>
              <div className="distribution-grid analytics-distributions">
                <Distribution title="시간대" rows={report.breakdowns.timeZones} />
                <Distribution title="화면 안쪽 크기" rows={report.breakdowns.viewports} />
                <Distribution title="기기 화면 크기" rows={report.breakdowns.screenSizes} />
                <Distribution title="픽셀 비율" rows={report.breakdowns.pixelRatios} />
              </div>
            </details>
          </section>
        </>
      ) : null}
      <section className="card" aria-labelledby="analytics-legacy-title">
        <h2 id="analytics-legacy-title">단축 주소 리디렉트 기록</h2>
        <p className="section-help">
          선택한 같은 기간의 서버 302 기록이에요. 한 동작이 브라우저 행동에도 남을 수 있어 위 수치와 더하지 않아요.
          JavaScript 차단·수집 이전 자료도 포함될 수 있어요.
        </p>
        <dl className="stat-tiles analytics-tiles">
          <Tile title="단축 주소 방문" value={analyticsCount(report.legacy.visits)} />
          <Tile title="링크 리디렉트 클릭" value={analyticsCount(report.legacy.linkClicks)} />
          <Tile title="크리에이터 배너 리디렉트 클릭" value={analyticsCount(report.legacy.creatorBannerClicks)} />
        </dl>
      </section>
    </>
  );
}

export function Tile({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DailyTrend({ daily }: { daily: AnalyticsDaily[] }) {
  if (!daily.some((day) => day.pageViews > 0 || day.clicks > 0))
    return <p className="empty-text">이 기간에 수집된 페이지뷰·클릭이 없어 추이를 표시하지 않아요.</p>;
  const maximum = Math.max(1, ...daily.map((day) => Math.max(day.pageViews, day.clicks)));
  const width = 680 / daily.length;
  return (
    <figure className="analytics-trend">
      <figcaption>막대: 페이지뷰 · 점선: 클릭 · 일별 최대 {formatNumber(maximum)}회</figcaption>
      <svg viewBox="0 0 720 160" role="img" aria-labelledby="analytics-chart-title analytics-chart-description">
        <title id="analytics-chart-title">일별 페이지뷰와 클릭</title>
        <desc id="analytics-chart-description">
          {daily[0].day}부터 {daily.at(-1)?.day}까지의 페이지뷰 막대와 클릭 점선. 정확한 수치는 아래 일별 데이터 표에서
          확인할 수 있어요.
        </desc>
        <line x1="20" y1="155" x2="700" y2="155" className="analytics-axis" />
        {daily.map((day, index) => (
          <rect
            key={day.day}
            x={20 + index * width}
            y={155 - (day.pageViews / maximum) * 130}
            width={Math.max(0.5, width * 0.7)}
            height={(day.pageViews / maximum) * 130}
            className="analytics-bar"
          >
            <title>{`${day.day}: ${formatNumber(day.pageViews)}회`}</title>
          </rect>
        ))}
        <polyline
          points={daily
            .map((day, index) => `${20 + (index + 0.35) * width},${155 - (day.clicks / maximum) * 130}`)
            .join(' ')}
          className="analytics-click-line"
        />
        {daily.length === 1 ? (
          <circle
            cx={20 + width * 0.35}
            cy={155 - (daily[0].clicks / maximum) * 130}
            r="3"
            className="analytics-click-point"
          />
        ) : null}
      </svg>
      <div className="analytics-chart-dates" aria-hidden="true">
        <span>{daily[0].day}</span>
        <span>{daily.at(-1)?.day}</span>
      </div>
    </figure>
  );
}

function DailyTables({ daily }: { daily: AnalyticsDaily[] }) {
  const newestFirst = [...daily].reverse();
  return (
    <>
      <p className="field-help">최근 {Math.min(7, daily.length)}일 · 최신순 · 전체 기간의 합계는 바뀌지 않아요.</p>
      <p className="field-help">표를 가로로 밀면 나머지 수치를 볼 수 있어요.</p>
      <DailyTable daily={newestFirst.slice(0, 7)} label="최근 일별 데이터 가로 스크롤" />
      {daily.length > 7 ? (
        <details className="analytics-table-details">
          <summary>이전 {daily.length - 7}일 데이터 보기</summary>
          <DailyTable daily={newestFirst.slice(7)} label="이전 일별 데이터 가로 스크롤" />
        </details>
      ) : null}
    </>
  );
}

function DailyTable({ daily, label }: { daily: AnalyticsDaily[]; label: string }) {
  if (daily.length === 0) return null;
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      <table className="data-table analytics-table analytics-daily-table">
        <caption className="visually-hidden">일별 브라우저 행동과 별도 리디렉트 방문</caption>
        <thead>
          <tr>
            {[
              '날짜',
              '페이지뷰',
              '익명 순 방문자',
              '세션',
              '클릭',
              '가시 노출',
              '평균 활성 체류',
              '클릭 페이지뷰 비율',
              '302 방문 (별도)',
            ].map((label, index) => (
              <th key={label} scope="col" className={index ? 'num' : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {daily.map((day) => (
            <tr key={day.day}>
              <th scope="row">{day.day}</th>
              <td className="num">{analyticsCount(day.pageViews)}</td>
              <td className="num">{analyticsCount(day.uniqueVisitors)}</td>
              <td className="num">{analyticsCount(day.sessions)}</td>
              <td className="num">{analyticsCount(day.clicks)}</td>
              <td className="num">{analyticsCount(day.impressions)}</td>
              <td className="num">{analyticsDuration(day.averageActiveMs)}</td>
              <td className="num">{analyticsPercent(day.clickThroughRate)}</td>
              <td className="num">{analyticsCount(day.legacyVisits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TargetTable({ rows }: { rows: AnalyticsTarget[] }) {
  if (rows.length === 0) return <p className="empty-text">이 기간에 대상별 클릭·노출이 수집되지 않았어요.</p>;
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="대상별 성과 가로 스크롤">
      <table className="data-table analytics-table">
        <caption className="visually-hidden">대상별 클릭·가시 노출·후속 클릭 비율</caption>
        <thead>
          <tr>
            <th scope="col">대상</th>
            <th scope="col">종류</th>
            <th scope="col" className="num">
              클릭
            </th>
            <th scope="col" className="num">
              가시 노출
            </th>
            <th scope="col" className="num">
              노출 후 클릭 비율
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.targetKind}:${row.targetId}`}>
              <th scope="row">{row.label ?? '(삭제되었거나 이름 없는 대상)'}</th>
              <td>{ANALYTICS_TARGET_LABELS[row.targetKind]}</td>
              <td className="num">{analyticsCount(row.clicks)}</td>
              <td className="num">{analyticsCount(row.impressions)}</td>
              <td className="num">{analyticsPercent(row.clickThroughRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Distribution({ title, rows }: { title: string; rows: CountByValue[] }) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="distribution">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-text">분포 자료가 없어요.</p>
      ) : (
        <table className="data-table compact analytics-distribution">
          <caption className="visually-hidden">{title}별 페이지뷰</caption>
          <thead>
            <tr>
              <th scope="col">분류</th>
              <th scope="col" className="num">
                페이지뷰
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value}>
                <th scope="row">
                  {analyticsDimension(row.value)}
                  <span
                    className="analytics-meter"
                    aria-hidden="true"
                    style={{ width: `${(row.count / maximum) * 100}%` }}
                  />
                </th>
                <td className="num">{formatNumber(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
