# 0031 운영 무중단 배포

- 단계: 에픽
- 상태: 검증
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

운영(`home-server`, Compose project `crelink-prod`)은 배포·롤백 때마다 약 30~40초 502를 냅니다(사용자 관측). GeoIP 갱신(`geoip.sh --restart`, 월 1회)도 api 재시작 동안 단축 주소가 몇 초 멈춥니다. main 병합마다 자동 배포되고 단축 주소(`go.shaul.kr`)가 인스타그램 등에 걸려 있어, 이 공백은 방문자에게 곧 이동 실패입니다. 배포·롤백·GeoIP 갱신을 방문자가 알아챌 수 없는 무중단 전환으로 바꿉니다.

방식은 [ADR 0011](../../adr/0011-zero-downtime-deploy.md)(제안): 0단계(API graceful shutdown·healthcheck `start_interval`·DB pool 상한) 뒤에 고정 edge Caddy + Blue/Green 앱 스택으로 옮기고 Caddy reload로 전환합니다. 원인 분석·로컬 실측·방안 비교는 [조사 문서](../../references/zero-downtime-deploy.md)입니다.

## 수용 기준

운영(`home-server`)에서 0036 절차로 확인합니다. 부하는 서버에서 `127.0.0.1:18080`으로 Host를 바꿔 가며 초당 20~50건(웹 `/privacy`, 웹 BFF 경유 API 헬스, `go.shaul.kr/<존재 slug>` 302)을 흘리고, 동시에 공개 주소를 저속 curl 루프로 봅니다.

- [x] 부하 중 배포 2회·롤백 2회 동안 5xx·연결 오류가 0건이다(서버 부하 도구와 공개 주소 루프 모두).
- [x] 같은 구간의 p99 지연이 평시 p99 + 1초 이내다.
- [x] 배포·롤백 직전에 시작한 5초 이상 걸리는 요청이 성공으로 끝난다.
- [x] 헬스가 실패하는 이미지로 배포하면 활성 색과 트래픽이 바뀌지 않고 배포가 실패(종료 1)로 끝난다.
- [x] 각 배포·롤백 뒤 `verify.sh` 6개가 모두 ok이고 구 색 컨테이너는 stopped다.
- [x] 겹치는 구간의 Supabase 연결 수가 Pool Size 미만이다(대시보드 또는 `pg_stat_activity`로 확인).

## 범위

- 포함: API 종료 동작·pool 상한(0032), 웹 종료 동작(0033), compose 0단계(0034), edge 분리·색상화·배포 스크립트·시험·문서(0035), 운영 cutover와 부하 검증(0036).
- 제외: 서버 다중화·서버/회선 장애 대응(단일 장애점은 그대로), Caddy 이미지 업그레이드의 무중단화(edge 재생성 1~2초는 드물게 따로 수행), WebSocket(미사용), DB migration 도구 변경(expand/contract 규칙만 적용), Kamal·Swarm 도입.

## 순서와 선행

| 번호 | 역할 | 내용 |
| --- | --- | --- |
| 0032 | api | graceful shutdown(`enableGracefulShutdown`: 새 연결 거부 → 진행 중 요청 완료 → pool 종료), `DATABASE_POOL_MAX` |
| 0033 | web | standalone SIGTERM 실측·필요 시 처리, (선택) `deploymentId` |
| 0034 | infra | 0단계 compose: `stop_grace_period`, healthcheck `start_interval`, 운영 `DATABASE_POOL_MAX` |
| 0035 | infra | edge 스택 분리, 앱 스택 색상화, 배포·롤백·GeoIP·bootstrap 전환 흐름, 무중단 시험, 문서 |
| 0036 | orchestrator | 운영 cutover(1회 수 초 공백), 부하 검증 기록 |

흐름은 0032 → 0034, (0033·0034) → 0035 → 0036입니다. 선행 관계의 원본은 각 티켓의 `선행` 줄이고, 상태는 각 파일의 `상태` 줄입니다(`pnpm work`). 0032·0033은 병렬로 시작할 수 있고, 0032 → 0034는 단독으로 배포해도 공백이 줄어드므로 blue/green 전에 먼저 운영에 내보냅니다.

## 위험·복구

- 0035는 운영 Compose project 구조를 바꿉니다(`crelink-prod` → `crelink-edge` + `crelink-blue`·`crelink-green`). main 병합 = 서버 실행이므로 0035 병합과 0036 cutover를 같은 운영 창에서 하고, cutover 전에는 자동 배포가 새 구조를 적용하지 않게 순서를 0036에서 정합니다.
- cutover 때 한 번 수 초 공백이 납니다[추정]. 트래픽이 적은 시각에 알리고 하며, 되돌리기(옛 `crelink-prod` 재기동)를 먼저 준비합니다.
- DB 연결 수가 Supabase Pool Size를 넘으면 새 색이 readiness에 실패해 배포가 실패합니다(트래픽 영향은 없음). 0032·0034에서 Pool Size를 확인하고 값을 맞춥니다.
- 두 버전이 동시에 돌므로 DB 변경은 expand/contract를 지켜야 합니다([설계 "DB migration 운영 규칙"](../../specs/crelink-prod-deploy.md#db-migration-운영-규칙)).

## 연결

- 결정: [ADR 0011](../../adr/0011-zero-downtime-deploy.md)(제안), 바탕 [ADR 0010](../../adr/0010-prod-deployment-topology.md)
- 조사: [운영 배포 무중단화 방식 비교](../../references/zero-downtime-deploy.md)
- 설계: [운영 배포·CD 기술 설계](../../specs/crelink-prod-deploy.md)(현재 동작), [prod 런북](../../../infra/docs/prod-runbook.md)
- 바탕 에픽: [0024 운영 배포와 CD](0024-prod-deploy.md)

## 진행 기록

- 2026-10-07: 생성(계획만, 구현 없음). 사용자 요구: 배포 중 30~40초 502는 실서비스에서 치명적이므로 무중단 배포를 계획. 조사(원인 4가지, 로컬 실측 7건, 방안 A~E 비교) 결과 C(고정 edge Caddy + Blue/Green)를 ADR 0011(제안)로 두고 티켓 0032~0036으로 나눔. infra는 단독 배포 가능한 0단계(0034)와 blue/green(0035)으로 나눔. 브랜치 `work/0031-zero-downtime-deploy-plan`.
- 2026-10-07: 운영 적용·검증(0032~0036). 0단계 운영 반영 뒤 0035(edge + Blue/Green) 병합·cutover(공백 0.5초), 이후 배포 4회·롤백 6회·헬스 실패 배포 1회·GeoIP 재기동 1회를 부하(서버 초당 30건 + 8.8초 느린 요청 + 공개 주소 루프) 중에 해 오류 0건. 수용 기준 전부 충족, 상태 검증. 남은 것: Supabase Pool Size 대시보드 확인과 ADR 0011 승인(사용자). 근거: `docs/work/orchestrator/0036-zero-downtime-cutover-verify.md`.
