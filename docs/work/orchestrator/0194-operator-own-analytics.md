# 0194 운영자 본인 지표·통계 404 수정과 운영 검증

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 결함
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-06

## 목적

본인 랜딩이 있는 사람 운영자가 지표·통계를 열면 `creator_not_found`가 발생하는 결함을 수정한다. 사용자가 코드 수정·배포·실제 브라우저 확인을 명시 요청했다.

## 수용 기준

- [x] 운영자 본인 조회의 대상 확인과 모든 집계에 본인 범위를 적용하고 실제 HTTP 회귀로 확인한다.
- [x] 타인 필터 거부·사람 계정 조건·관리자 전체의 크리에이터 범위와 제외 정책을 유지한다.
- [x] 전체 검증·로컬 smoke·비밀값 검사와 PR CI를 통과한다.
- [x] main 병합 후 같은 SHA의 Deploy·운영 주소 검사·배포 태그를 확인한다.
- [x] 기존 운영자 로그인 세션으로 보고된 metrics·stats 화면의 정상 렌더링과 기간 조회를 확인한다.

## 범위

- 포함: AnalyticsService의 본인 조회 역할 제한, 회귀 검사, API·설계 문서, 변경 기록과 릴리스 노트, 기존 CD 배포.
- 제외: 관리자 전체 지표 정의 변경, AI 계정 허용, 로그인 방식 변경, 운영 DB 직접 쓰기·시험 방문 생성, 기존 0193 미커밋 기록 변경.

## 위험·복구

소유자 제한을 넓히지 않고 인증된 본인 ID만 사용한다. 스키마·데이터 변경은 없다. 장애 시 기존 Blue/Green 배포 롤백을 사용한다. 운영 확인은 사용자가 보고한 장애의 복구 확인으로, 기존 로그인 세션의 관리 화면과 집계 GET만 읽는다.

## 연결

- [조회 설계](../../specs/crelink-analytics.md)
- [API 안내](../../../apps/api/docs/analytics.md)
- [검증 루프](../../development/verification.md)

## 진행 기록

- 2026-11-06: ego-lite TaskSpace22에서 기존 운영자 세션의 metrics 오류를 재현했다. 직전 진단에서 본인 랜딩200·본인 analytics404를 확인했고, 대상과 집계 SQL 모두 role=creator로 제한하는 원인을 확인했다. 현재 branch는 origin/main472139b 기준이며 기존0193 미커밋 변경은 보존하고 이번 커밋에서 제외한다.

- 2026-11-06 로컬 검증: 추가 회귀는 수정 전404로 실패했고 수정 후 analytics11개 통과. pnpm verify --keep-going8단계43.6초·총420검사(shared59/web95/API248/안전경계18) 통과. make up 후 pnpm smoke5개 통과(health/ready·홈 콘솔·1280/390 가로넘침). pnpm work:scope0194·git diff --check 통과. 관리자 필터 거부와 서비스 전체의 운영자 제외를 실제 PostgreSQL HTTP로 확인했다.

- 2026-11-06 배포: [PR141](https://github.com/ai-worker-lab/crelink/pull/141)의 [CI42066126582](https://github.com/ai-worker-lab/crelink/actions/runs/42066126582)가 Node24/26·smoke·API/웹 이미지·scope·최종 CI 모두 성공했다. main squash는 ca494be9c8c821a8662b58e1dca482d91f3a6ac7(2026-11-05T16:40:01Z)이며 검증한 소스와 일치한다. [Deploy42066783393](https://github.com/ai-worker-lab/crelink/actions/runs/42066783393)의 API/웹 이미지·home-server 배포·운영 주소 검사·기록 job 전부 성공했다. 운영 배포 job 완료 2026-11-06T01:43:30+09:00, 기록 job 완료01:43:41+09:00. 원격 deploy/prod·deploy/prod-api·deploy/prod-web가 모두 같은 SHA임을 확인했다.
- 2026-11-06 운영 브라우저: 기존 사람 운영자 세션의 지표·통계 두 경로에서404 안내가 사라지고 본인 집계가 표시됐다. BFF 본인 analytics200, pageViews2·click0·impression2·activeMs19184·순방문2·세션2, 기존 visits45·linkClicks2를 확인했다. 최근7일 링크를 실제 클릭해 from=2026-10-31/to=2026-11-06과 일별7행 반영을 확인했다. Runtime/console 오류0·실패 네트워크 응답0, 실제 데스크톱1816px·모바일 에뮬레이션390px에서 문서 가로넘침0을 확인했고 PNG2개를 열어 검토했다. 근거는 Git 제외 .local/0194-evidence의 metrics-desktop.png·stats-desktop.png·stats-7-days.png다. TaskSpace22를 종료했다. 운영 DB 직접 조회·수정, 공개 방문 생성, 실제 휴대폰 조작은 하지 않았다.
