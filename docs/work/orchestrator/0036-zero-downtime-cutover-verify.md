# 0036 운영 무중단 배포 cutover와 부하 검증

- 단계: 티켓
- 역할: orchestrator
- 상위: 0031
- 선행: 0035
- 상태: 분류 대기
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

0035의 edge + Blue/Green 구조를 운영 `home-server`에 처음 적용(cutover)하고, 에픽 0031의 통합 수용 기준을 실제 운영 경로에서 부하를 흘리며 확인·기록합니다. cutover는 18080을 쥔 Caddy를 `crelink-prod`에서 `crelink-edge`로 바꾸는 순간 한 번 수 초 공백이 납니다[추정]. 이 공백을 알리고, 되돌리기를 먼저 준비하고, 이후 배포·롤백이 무중단인지 숫자로 남기는 것이 목적입니다.

## 수용 기준

### 준비

- [ ] 사용자 확인을 기록한다: Supabase Pool Size와 운영 `DATABASE_POOL_MAX`(0034), cutover 날짜·시각(트래픽이 적은 시간), 공백 알림 여부·대상, 구 색을 drain 뒤 멈출지 롤백 대기용으로 켜 둘지(기본 멈춤).
- [ ] 0032·0033·0034가 운영에 배포되어 있고(배포 기록 태그·`status`), 0035가 `검증` 이상이다.
- [ ] 병합·적용 순서를 정해 기록한다. 기본안: 운영 창에서 0035를 main에 병합 → 자동 배포가 새 릴리스를 서버 `releases/<SHA>`에 풀고 edge 미준비로 아무것도 바꾸지 않은 채 실패(0035 수용 기준, 운영 영향 없음) → 서버에서 `bootstrap.sh` 재실행(네트워크·edge 폴더·`ssh-entry.sh`) → 런북 cutover 절 실행. 대안: Deploy 워크플로를 잠시 끄고 수동 실행.
- [ ] 되돌리기를 먼저 리허설한다(로컬 또는 0035 시험 환경): edge 정지 → 옛 `crelink-prod` 릴리스로 `up --wait` → `verify` 6개 ok. 걸린 시간을 기록한다.
- [ ] 이미지(`caddy:2.11.7-alpine`, 새 api·web)를 서버에 미리 pull해 cutover 중 다운로드가 없게 한다.

### cutover

- [ ] 런북 cutover 절대로 실행한다: `crelink-blue`를 새 릴리스로 포트 없이 `up --wait` → `crelink-prod` caddy 정지 → edge caddy 기동 → `crelink-prod` api·web `down`(볼륨 유지) → `state/active-color=blue`. 서버에서 0.2초 간격 curl 루프로 실제 공백 길이를 재고, 직후 `verify` 6개 ok를 확인한다. 실패하면 준비한 되돌리기를 실행한다.
- [ ] 환경·커밋·시각(UTC)·공백 길이·결과를 진행 기록에 남긴다.

### 부하 검증 (에픽 0031 수용 기준)

- [ ] 부하: 서버에서 `oha`·`hey`(또는 그 컨테이너 이미지, 서버에 설치하지 않음)나 curl 루프로 `127.0.0.1:18080`에 Host를 바꿔 가며 초당 20~50건: `links.shaul.kr` `/privacy`(웹), `links.shaul.kr/api/backend/api/health`(web→api 경로), `go.shaul.kr/<존재 slug>`(API 302). 동시에 운영자 회선에서 공개 주소를 저속 curl 루프로 본다(데이터센터 IP는 Cloudflare 403). 평시 p99를 먼저 잰다.
- [ ] Deploy(`force`, 같은 커밋) 2회와 Rollback 2회 동안 5xx·연결 오류 0건, p99가 평시 + 1초 이내.
- [ ] 각 배포·롤백 직전에 시작한 5초 이상 요청이 성공한다(예: 큰 웹 정적 파일을 `curl --limit-rate`로 받기, 운영자 계정 업로드를 `--limit-rate`로 보내기).
- [ ] 헬스가 실패하는 조건으로 배포 1회(방법은 0035 시험의 실패 변형을 따름): 종료 1, 활성 색·`current`·트래픽 불변, 부하 오류 0건.
- [ ] 매 배포·롤백 뒤 `verify` 6개 ok, `docker ps`에서 구 색 stopped, 겹치는 구간의 Supabase 연결 수가 Pool Size 미만(`pg_stat_activity` 또는 대시보드).
- [ ] `geoip.sh --restart` 1회도 오류 0건(월 1회 cron 경로).

### 문서·마무리

- [ ] `docs/specs/crelink-prod-deploy.md`를 현재 동작으로 고친다: 구성·서버 배치(project·`state/active-color`·edge 폴더), "릴리스·배포·롤백"의 무중단 아님 문장과 흐름, 이식 규칙 7·8, 위험·후속, 변경 범위 표, 변경 기록.
- [ ] `infra/docs/prod-runbook.md` 머리말의 "배포 중 약 30~40초 502" 현재 제약 문구를 실제 결과로 바꾼다(cutover 결과가 다르면 0035 절차와 함께 갱신).
- [ ] ADR 0011 상태를 사용자 확인에 따라 `승인`으로 바꾸고 `docs/README.md` 색인 설명을 맞춘다. 0033에서 `deploymentId`를 넣었으면 `.github/workflows/` 웹 이미지 빌드 인자(커밋 SHA)를 연결한다.
- [ ] 루트 `CHANGELOGS.md`, 에픽 0031 수용 기준 체크와 상태.

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
