# 0054 Sentry 프로젝트를 ai-worker-lab 조직으로 옮기기

- 단계: 티켓
- 역할: orchestrator
- 선행: 0052
- 상태: 진행
- 종류: 운영
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-08

## 목적

API·웹 Sentry 프로젝트가 개인 조직 `shaul1991`에 있습니다. 저장소·GitHub 조직(`ai-worker-lab`)과 같은 이름의 Sentry 조직 `ai-worker-lab`으로 모아 관리합니다.

## 결정(2026-10-08 사용자)

- 방식: Transfer Project가 아니라 `ai-worker-lab`에 `crelink-api`·`crelink-web`을 새로 만듭니다. `shaul1991`의 기존 이슈·리플레이·로그는 그 조직에 남고(보관 30일) 새 조직에서는 보이지 않습니다.
- 옛 조직: 삭제하지 않고 둡니다. 거짓 알림이 나지 않게 옛 조직의 Uptime·Cron 모니터만 끕니다.
- 두 조직 모두 US 저장 위치·무료 Developer 요금제, owner 같은 계정(2026-10-08 확인). 수집 범위·개인정보 결정(ADR 0012·0014)은 그대로입니다.

## 수용 기준

- [ ] `ai-worker-lab`에 `crelink-api`(NestJS)·`crelink-web`(Next.js) 프로젝트, 기본 이슈 알림, Inbound filters(브라우저 확장·localhost·크롤러·오래된 브라우저·헬스 체크), Uptime 모니터(`https://links.shaul.kr/api/backend/api/health`)가 있다.
- [ ] 운영 값이 새 조직을 가리킨다: 암호문 `SENTRY_DSN`(새 crelink-api DSN), GitHub variables `SENTRY_ORG=ai-worker-lab`·`SENTRY_WEB_DSN`(새 crelink-web DSN), secret `SENTRY_AUTH_TOKEN`(새 조직 토큰).
- [ ] 배포 뒤 새 조직에서 소스맵 업로드·릴리스, 로그·지표·Cron(`crelink-api-retention` 자동 생성)·Uptime·오류·리플레이·브라우저 세션이 보이고, 옛 조직에는 새 이벤트가 오지 않는다.
- [ ] 옛 조직의 Uptime·Cron 모니터가 꺼져 있다.
- [ ] 런북 15·변경 기록 갱신.

## 범위

- 포함: Sentry 화면 설정(두 조직), 운영 암호문 `SENTRY_DSN`, GitHub variables·secret, 런북·문서.
- 제외: 코드 변경, 옛 조직·옛 프로젝트 삭제, 수집 범위 변경.

## 위험·복구

- 토큰 순서: `SENTRY_ORG`를 바꾼 뒤 옛 조직 토큰으로 이미지를 빌드하면 소스맵 업로드가 실패해 배포가 막힙니다. 새 조직 토큰을 먼저 넣고 강제 배포합니다.
- 웹 DSN은 빌드 시점 값이라 웹 이미지를 다시 빌드해야 바뀝니다(`force` 배포).
- 되돌리기: 암호문·variables·secret을 옛 값으로 돌리고 강제 배포, 옛 조직 모니터 다시 켜기.

## 연결

- 결정: `docs/adr/0012-error-monitoring-sentry.md`, `docs/adr/0014-sentry-free-plan-features.md`
- 절차: `infra/docs/prod-runbook.md#15-sentry-오류성능-모니터링`

## 진행 기록

- 2026-10-08: 생성·착수(브랜치 `work/0054-sentry-org-migration`). 사용자 요청: "shaul1991 조직에서 ai-worker-lab 조직으로 프로젝트를 이관". 조사: Sentry 프로젝트 이관은 같은 저장 위치끼리만 되고 릴리스·세션은 옮겨지지 않음(Sentry Help Center "How can I transfer projects between Sentry organisations?"), 이관 뒤 environment 필터 결함(getsentry/sentry#92817). 사용자 결정: 새 프로젝트 만들기, 옛 조직은 빈 채로 둠.
