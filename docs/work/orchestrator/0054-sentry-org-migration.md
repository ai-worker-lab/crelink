# 0054 Sentry 프로젝트를 ai-worker-lab 조직으로 옮기기

- 단계: 티켓
- 역할: orchestrator
- 선행: 0052
- 상태: 완료
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

- [x] `ai-worker-lab`에 `crelink-api`(NestJS)·`crelink-web`(Next.js) 프로젝트, 기본 이슈 알림, Inbound filters(브라우저 확장·localhost·크롤러·오래된 브라우저·헬스 체크), Uptime 모니터(`https://links.shaul.kr/api/backend/api/health`)가 있다.
- [x] 운영 값이 새 조직을 가리킨다: 암호문 `SENTRY_DSN`(새 crelink-api DSN), GitHub variables `SENTRY_ORG=ai-worker-lab`·`SENTRY_WEB_DSN`(새 crelink-web DSN), secret `SENTRY_AUTH_TOKEN`(새 조직 토큰).
- [x] 배포 뒤 새 조직에서 소스맵 업로드·릴리스, 로그·지표·Cron(`crelink-api-retention` 자동 생성)·Uptime·오류·리플레이·브라우저 세션이 보이고, 옛 조직에는 새 이벤트가 오지 않는다.
- [x] 옛 조직의 Uptime·Cron 모니터가 꺼져 있다.
- [x] 런북 15·변경 기록 갱신.

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
- 2026-10-08: 새 조직 설정(로그인 브라우저 세션으로 Sentry API·화면). 조직 확인: `shaul1991`(ID 877167)·`ai-worker-lab`(ID 4512218536345600) 모두 `https://us.sentry.io`·`am3_f` Developer, owner 같은 계정. 팀 `ai-worker-lab`에 `crelink-api`(node-nestjs, 프로젝트 4512218867957760)·`crelink-web`(javascript-nextjs, 4512218868023296)를 `default_rules`로 만듦 → 프로젝트마다 "Send a notification for high priority issues(Email)" 알림 생김. 두 프로젝트에 Inbound filters 5종 켬. Uptime 모니터 10573814(`crelink-web`·`production`·1분·5초·실패 3·복구 1·Allow Sampling 끔) 생성.
- 2026-10-08: 운영 값 교체. 암호문 `SENTRY_DSN`을 새 crelink-api DSN으로(`sops set`, `SENTRY_DSN` 외 복호화 값 해시 불변 확인). 사용자가 새 조직 Organization Token을 secret `SENTRY_AUTH_TOKEN`에 넣음(05:15:23Z). 처음 확인 때 secret 갱신 시각이 옛 값으로 보여 먼저 바꾼 variables를 바로 옛 값으로 되돌렸다가, 갱신을 확인한 뒤 `SENTRY_ORG=ai-worker-lab`·`SENTRY_WEB_DSN`(새 crelink-web DSN)으로 바꿈.
- 2026-10-08: 배포. PR #43 CI 6개 통과 → rebase 병합 `2235ed2` → CI·Deploy run 37731965585 성공(이미지 건너뜀, `infra/prod` 변경으로 API가 새 DSN을 읽음) → `force` Deploy run 37732103218 성공(이미지 api·web 다시 빌드, 배포 home-server).
- 2026-10-08: 운영 확인(새 조직).
  - 릴리스 `2235ed2`가 `crelink-api`·`crelink-web` 둘 다에 생기고 소스맵 artifact bundle이 붙음(새 조직 토큰으로 업로드 성공).
  - API: Logs에 기동 로그, Cron 모니터 `crelink-api-retention` 자동 생성(production)·체크인 `in_progress`→`ok`, 지표 `crelink.short_link.visit` 1·`crelink.link.click` 1(본인 단축 주소 방문·링크 클릭, `user.id`·`client.address` 없음).
  - 웹: 운영 `/privacy`에서 경고·오류 → 브라우저가 새 조직 `crelink-web`(o4512218536345600/4512218868023296)로만 보냄, 로그 `sentry-check-0054 warn`, 이슈 `Error: sentry-check-0054`(release `2235ed2…`, `replayId`), 리플레이 1건(오류 1), 브라우저 세션(새 릴리스 43건), `/me` 의견 1건(이름·이메일 없음). Uptime 1분마다 200(657~733ms, 100%).
  - 옛 조직: 마지막 로그 05:22:21Z(Blue/Green 전환 중 옛 색 API) 뒤로 없음, `sentry-check-0054` 이슈 0건. 옛 Uptime 모니터 10573253 Disable, 옛 Cron 모니터 `crelink-api-retention` `disabled`. 옛 프로젝트·기록은 그대로 둠.
  - 확인용 이슈 2건(오류·의견)은 Resolve함.
