import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyticsApiQuery,
  analyticsCount,
  analyticsDimension,
  analyticsDuration,
  analyticsFilters,
  analyticsHref,
  analyticsPercent,
} from './analytics.ts';

describe('분석 화면 조회 범위', () => {
  it('내 통계는 URL을 조작해도 다른 계정·관리자 조건을 API에 넘기지 않는다', () => {
    const search = {
      from: '2026-11-01',
      to: '2026-11-06',
      creatorId: 'someone-else',
      includeExcluded: '1',
      creatorQuery: 'email@example.test',
    };
    const filters = analyticsFilters(search);
    assert.equal(filters.creatorId, '');
    assert.equal(filters.creatorQuery, '');
    assert.equal(filters.includeExcluded, false);
    assert.equal(analyticsApiQuery(filters).toString(), 'from=2026-11-01&to=2026-11-06');
  });

  it('관리자 조건과 목록 검색은 유지하되 검색용 개인정보 쿼리는 분석 API에 보내지 않는다', () => {
    const filters = analyticsFilters(
      {
        from: '2026-11-01',
        to: '2026-11-06',
        creatorId: 'ABCD',
        includeExcluded: '1',
        creatorQuery: 'name & email',
        creatorPage: '2',
      },
      true,
    );
    assert.equal(filters.creatorId, 'abcd');
    assert.equal(
      analyticsApiQuery(filters, true).toString(),
      'from=2026-11-01&to=2026-11-06&creatorId=abcd&includeExcluded=1',
    );
    const href = new URL(analyticsHref('/admin/stats', filters, { from: '2026-10-01' }), 'http://web.test');
    assert.equal(href.searchParams.get('from'), '2026-10-01');
    assert.equal(href.searchParams.get('creatorId'), 'abcd');
    assert.equal(href.searchParams.get('creatorQuery'), 'name & email');
    assert.equal(href.searchParams.get('creatorPage'), '2');
  });

  it('날짜 오류는 임의로 0/다른 기간으로 바꾸지 않고 API 검증으로 보낸다', () => {
    const filters = analyticsFilters({ from: '2026-02-30', to: 'bad', creatorPage: '-1' }, true);
    assert.equal(filters.from, '2026-02-30');
    assert.equal(filters.to, 'bad');
    assert.equal(filters.creatorPage, 1);
  });
});

describe('분석 수치와 미수집 표기', () => {
  it('0과 복원/계산할 수 없는 null을 다른 값으로 표시한다', () => {
    assert.equal(analyticsCount(0), '0');
    assert.equal(analyticsCount(null), '확인 불가');
    assert.equal(analyticsPercent(0), '0%');
    assert.equal(analyticsPercent(0.125), '12.5%');
    assert.equal(analyticsPercent(null), '계산 불가');
    assert.equal(analyticsDuration(0), '0초');
    assert.equal(analyticsDuration(null), '계산 불가');
    assert.equal(analyticsDuration(125000), '2분 5초');
  });

  it('미상과 상위 분포 밖 기타를 구분한다', () => {
    assert.equal(analyticsDimension('unknown'), '알 수 없음');
    assert.equal(analyticsDimension(''), '알 수 없음');
    assert.equal(analyticsDimension('other'), '기타');
    assert.equal(analyticsDimension('KR'), 'KR');
  });
});
