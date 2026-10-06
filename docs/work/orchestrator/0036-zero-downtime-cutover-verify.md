# 0036 운영 무중단 배포 cutover와 부하 검증

- 단계: 티켓
- 역할: orchestrator
- 상위: 0031
- 선행: 0035
- 상태: 완료
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

0035의 edge + Blue/Green 구조를 운영 `home-server`에 처음 적용(cutover)하고, 에픽 0031의 통합 수용 기준을 실제 운영 경로에서 부하를 흘리며 확인·기록합니다. cutover는 18080을 쥔 Caddy를 `crelink-prod`에서 `crelink-edge`로 바꾸는 순간 한 번 수 초 공백이 납니다[추정]. 이 공백을 알리고, 되돌리기를 먼저 준비하고, 이후 배포·롤백이 무중단인지 숫자로 남기는 것이 목적입니다.

## 수용 기준

### 준비

- [x] 사용자 확인을 기록한다: Supabase Pool Size와 운영 `DATABASE_POOL_MAX`(0034), cutover 날짜·시각(트래픽이 적은 시간), 공백 알림 여부·대상, 구 색을 drain 뒤 멈출지 롤백 대기용으로 켜 둘지(기본 멈춤).
- [x] 0032·0033·0034가 운영에 배포되어 있고(배포 기록 태그·`status`), 0035가 `검증` 이상이다.
- [x] 병합·적용 순서를 정해 기록한다. 기본안: 운영 창에서 0035를 main에 병합 → 자동 배포가 새 릴리스를 서버 `releases/<SHA>`에 풀고 edge 미준비로 아무것도 바꾸지 않은 채 실패(0035 수용 기준, 운영 영향 없음) → 서버에서 `bootstrap.sh` 재실행(네트워크·edge 폴더·`ssh-entry.sh`) → 런북 cutover 절 실행. 대안: Deploy 워크플로를 잠시 끄고 수동 실행.
- [x] 되돌리기를 먼저 리허설한다(로컬 또는 0035 시험 환경): edge 정지 → 옛 `crelink-prod` 릴리스로 `up --wait` → `verify` 6개 ok. 걸린 시간을 기록한다.
- [x] 이미지(`caddy:2.11.7-alpine`, 새 api·web)를 서버에 미리 pull해 cutover 중 다운로드가 없게 한다.

### cutover

- [x] 런북 cutover 절대로 실행한다: `crelink-blue`를 새 릴리스로 포트 없이 `up --wait` → `crelink-prod` caddy 정지 → edge caddy 기동 → `crelink-prod` api·web `down`(볼륨 유지) → `state/active-color=blue`. 서버에서 0.2초 간격 curl 루프로 실제 공백 길이를 재고, 직후 `verify` 6개 ok를 확인한다. 실패하면 준비한 되돌리기를 실행한다.
- [x] 환경·커밋·시각(UTC)·공백 길이·결과를 진행 기록에 남긴다.

### 부하 검증 (에픽 0031 수용 기준)

- [x] 부하: 서버에서 `oha`·`hey`(또는 그 컨테이너 이미지, 서버에 설치하지 않음)나 curl 루프로 `127.0.0.1:18080`에 Host를 바꿔 가며 초당 20~50건: `links.shaul.kr` `/privacy`(웹), `links.shaul.kr/api/backend/api/health`(web→api 경로), `go.shaul.kr/<존재 slug>`(API 302). 동시에 운영자 회선에서 공개 주소를 저속 curl 루프로 본다(데이터센터 IP는 Cloudflare 403). 평시 p99를 먼저 잰다.
- [x] Deploy(`force`, 같은 커밋) 2회와 Rollback 2회 동안 5xx·연결 오류 0건, p99가 평시 + 1초 이내.
- [x] 각 배포·롤백 직전에 시작한 5초 이상 요청이 성공한다(예: 큰 웹 정적 파일을 `curl --limit-rate`로 받기, 운영자 계정 업로드를 `--limit-rate`로 보내기).
- [x] 헬스가 실패하는 조건으로 배포 1회(방법은 0035 시험의 실패 변형을 따름): 종료 1, 활성 색·`current`·트래픽 불변, 부하 오류 0건.
- [x] 매 배포·롤백 뒤 `verify` 6개 ok, `docker ps`에서 구 색 stopped, 겹치는 구간의 Supabase 연결 수가 Pool Size 미만(`pg_stat_activity` 또는 대시보드).
- [x] `geoip.sh --restart` 1회도 오류 0건(월 1회 cron 경로).

### 문서·마무리

- [x] `docs/specs/crelink-prod-deploy.md`를 현재 동작으로 고친다: 구성·서버 배치(project·`state/active-color`·edge 폴더), "릴리스·배포·롤백"의 무중단 아님 문장과 흐름, 이식 규칙 7·8, 위험·후속, 변경 범위 표, 변경 기록.
- [x] `infra/docs/prod-runbook.md` 머리말의 "배포 중 약 30~40초 502" 현재 제약 문구를 실제 결과로 바꾼다(cutover 결과가 다르면 0035 절차와 함께 갱신).
- [x] ADR 0011 상태를 사용자 확인에 따라 `승인`으로 바꾸고 `docs/README.md` 색인 설명을 맞춘다. 0033에서 `deploymentId`를 넣었으면 `.github/workflows/` 웹 이미지 빌드 인자(커밋 SHA)를 연결한다.
- [x] 루트 `CHANGELOGS.md`, 에픽 0031 수용 기준 체크와 상태.

## 범위

- 포함: 운영 서버 적용(bootstrap 재실행·cutover·검증), `docs/specs/crelink-prod-deploy.md`, `docs/adr/0011-zero-downtime-deploy.md` 상태, `docs/README.md`, `infra/docs/prod-runbook.md`의 제약 문구, 필요 시 `.github/workflows/`, 루트 `CHANGELOGS.md`, work item 기록.
- 제외: 스크립트·compose 설계 변경(문제가 나오면 0035로 되돌리거나 새 티켓), 앱 코드 변경.

## 위험·복구

- **cutover 공백**: 수 초[추정]. 트래픽이 적은 시각에 하고, 길어지면 즉시 되돌리기(edge 정지 → 옛 `crelink-prod` 릴리스 `up --wait`, 이때는 지금과 같은 수십 초 공백).
- **운영 데이터**: DB·S3 데이터는 바뀌지 않습니다. GeoIP 볼륨은 `crelink-prod_geoip`를 그대로 씁니다. `crelink-prod` 볼륨을 지우지 않습니다.
- **부하 시험 자체의 영향**: 초당 20~50건은 Supabase·서버에 작지만, 클릭 기록이 쌓이지 않게 단축 주소 부하는 시험용 slug(운영자 계정)로 하고 끝난 뒤 정리합니다.
- **승인**: 운영 서비스 중단(cutover 공백)과 서버 변경이므로 시각·방법을 사용자에게 확인받은 뒤 실행합니다.

## 연결

- 에픽: [0031 운영 무중단 배포](../epics/0031-zero-downtime-deploy.md)
- 결정: [ADR 0011](../../adr/0011-zero-downtime-deploy.md)(제안)
- 조사: [운영 배포 무중단화 방식 비교](../../references/zero-downtime-deploy.md)
- 설계·절차: [운영 배포 설계](../../specs/crelink-prod-deploy.md), [prod 런북](../../../infra/docs/prod-runbook.md), 바탕 운영 기록 [0029](0029-first-prod-provision-verify.md)

## 진행 기록

- 2026-10-07: 생성(에픽 0031 계획). 선행 0035(0035가 0033·0034, 0034가 0032를 기다림).
- 2026-10-07: 착수(사용자 지시 "0035 진행"에 cutover 포함). 결정 기록: 구 색은 drain 뒤 stop(기본안, 사용자 확인), `DATABASE_POOL_MAX=6`(Supabase Pool Size 15 [추정], 대시보드 확인 대기), cutover 시각 2026-10-06T21:16Z(한국 06:16, 트래픽 적은 시각), 공백 알림 대상 없음(운영자 1인). 이미지는 병합 배포가 미리 받아 둠(cutover 중 다운로드 없음).
- 2026-10-07: cutover 실행 [실측]. 순서: PR #14 병합(`5e3e847`) → 자동 배포 run 37532494608 무변경 실패(설계대로) → `bootstrap.sh` 재실행(네트워크 `crelink-edge`, `/opt/crelink/edge`) → `cutover.sh --dry-run` 점검 13개 ok → `cutover.sh 5e3e847…`(옛 릴리스 `433dc88`, 이미지 그대로). 단계 ④ blue 기동 5초, ⑤ 18080 넘기기 2초, 전체 9.7초. 서버 `measure-gap.sh -r 10`(0.1초 간격, go `/zzzz`·links `/privacy`·links BFF health): **최장 공백 0.5초**(대상마다 `000` 5건). 직후 `verify` 6개 ok, `status` color blue.
- 2026-10-07: 첫 무중단 배포 [실측]. 실패했던 Deploy run 37532494608의 배포 job을 다시 실행 → blue → green 전환(21:17:12Z) 성공, 배포 기록 태그 이동. 같은 시간 서버에서 158초 동안 대상마다 초당 10회(총 4749건) 측정: **실패 0건, 최장 공백 없음**, 성공 응답 최장 0.063초. 끝난 뒤 blue api·web `Exited (0)`(30초 강제 종료 아님), green·edge healthy.
- 2026-10-07: 문서·설정 정리(브랜치 `work/0036-zd-docs`, 운영 서버 접근 없음). 운영 설계를 Blue/Green 현재 동작과 실측(cutover 0.5초, 배포 2회 4,749건·7,872건 실패 0건)으로 고침(구성도·공개 경로·서버 배치·전환 흐름·DB migration·이식 규칙 3·7·8·변경 범위 0031~0036·위험·후속). `.github/dependabot.yml` docker-compose에 `/infra/prod/edge`, `deploy.yml`·`rollback.yml` 주석(동작 변경 없음), 런북 머리말 공백 문구, ADR 0010 상태(대체된 결정 부분)·ADR 0011 상태 설명·결과 한 줄(상태 `제안` 유지, 사용자 승인 대기), 배포 대상 아키텍처·외부 의존·환경과 비밀값·검증 루프·문서 색인·웹 README·`.env.example`·API 문서의 단일 스택 서술, 루트·infra·web·api 변경 기록.
- 2026-10-07: 부하 검증 [실측]. 서버 임시 하네스(일회용, 저장소에 두지 않음): `measure-gap.sh -r 10`(3개 경로 각 초당 10회, 합계 초당 30건) + 3초마다 느린 요청(BFF `POST /api/backend/api/me/links`에 90KB 본문을 10KB/s로 보냄, 약 8.8초, 세션이 없어 기대 응답 401 — 웹이 본문을 다 받은 뒤 API를 부르므로 전환 중 진행 중 요청을 대표) + 2초마다 `pg_stat_activity` 표본. 웹 정적 파일 느린 다운로드는 루프백 소켓 버퍼가 응답을 바로 받아 서버 쪽 요청이 길어지지 않아 쓰지 않음.
  - Rollback 워크플로(기본, `a9be871` → `5e3e847`, run 37536437932): 실패 0/2,442건(이 회차는 느린 요청 하네스 전).
  - Rollback 기본 대상이 옛 형식(`433dc88`)인 상태에서 실행(run 37536775214): 설계대로 거부·무변경(종료 1). 이어 `release=a9be871` Rollback(run 37536838936): 실패 0/3,471건, 느린 요청 39/39 정상, DB 연결 최대 전체 17·크리링 5.
  - 헬스 실패 배포(서버에서 `ssh-entry.sh deploy a9be871 badbad… 433dc88…`, `HEALTHCHECK` 항상 실패하는 임시 api 이미지): 종료 1, "green 를 내립니다. 활성 색(blue)·current·images.env·트래픽은 바뀌지 않았습니다", 실패 0/1,665건, 느린 요청 19/19. 임시 이미지 삭제.
  - `geoip.sh --restart`: blue → green 전환, 실패 0/1,290건, 느린 요청 15/15, DB 최대 16·4.
  - Deploy `force`(run 37537318454, 이미지 재빌드 `a9be871`): 실패 0/4,329건, 느린 요청 49/49, DB 최대 18·6.
  - Rollback 2회 연속(기본 `a9be871` → `5e3e847` run 37537631275, `release=a9be871` run 37537818831): 실패 0/5,307건, 느린 요청 59/59, DB 최대 20·8.
  - 공개 주소 루프(운영자 PC, Cloudflare 경유, 0.5초마다 웹 `/privacy`·단축 302·BFF health)를 걸고 Rollback 2회(run 37538036416, 37538176919): 실패 0/240건.
  - 앞서 기록한 자동 배포 2회(실패 0/4,749·0/7,872)와 합쳐 배포 4회·롤백 6회·헬스 실패 배포 1회·GeoIP 1회 모두 오류 0건. 성공 응답 최장 0.08초 이하(평시와 같은 수준, p99 기준 + 1초 이내). 매 전환 뒤 옛 색 `Exited (0)`, 워크플로 `verify` 6개 ok, 마지막 상태 `a9be871`·blue·`verify` 6개 ok.
  - DB 연결: `pg_stat_activity` 전체 최대 20(`max_connections` 60), 크리링 사용자 최대 8(Pool Size 15 미만).
  - 곁가지 발견: BFF로 100KB를 넘는 JSON 본문을 보내면 API가 `PayloadTooLargeError`를 413이 아니라 500으로 응답(`ApiExceptionFilter`). 무중단과 무관한 기존 동작이라 별도 처리 대상(사용자 결정).
- 2026-10-07: ADR 0011 승인(사용자). ADR 상태·결과 줄, `docs/README.md` 색인, 운영 설계 "운영 결과"·위험·후속·이식 규칙 8, 에픽 0031 결정 표기를 `승인`과 검증 결과로 맞춤. `deploymentId`는 넣지 않음(사용자 미결정).
- 2026-10-07: 사용자 확인: Supabase Pool Size 15(대시보드). `DATABASE_POOL_MAX=6`(`2 × 6 = 12 ≤ 15 − 2`) 그대로. 런북 12·설계 위험의 `[확인 못 함]`을 확인값으로 바꿈. 수용 기준 전부 충족, 완료.
