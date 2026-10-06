# 0034 운영 compose 0단계: 종료 유예·빠른 헬스 판정·DB pool 운영값

- 단계: 티켓
- 역할: infra
- 상위: 0031
- 선행: 0032
- 상태: 완료
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

blue/green(0035) 전에 단독으로 배포할 수 있는 0단계입니다. 지금 배포 공백 30~40초에는 헬스 판정 지연(이미지 HEALTHCHECK `--interval=10s`, `start_interval` 없음, 준비 뒤 최대 약 10초 더 대기)과 API 즉시 종료가 들어 있습니다. compose에서 종료 유예와 기동 중 헬스 간격을 고쳐 공백을 줄이고(십수 초 예상 [추정]), 0032의 `DATABASE_POOL_MAX` 운영값을 넣어 0035에서 두 색이 겹쳐도 Supabase 연결 상한을 넘지 않게 합니다. 이 티켓만으로 502가 없어지지는 않습니다.

## 수용 기준

- [x] `infra/prod/compose.yaml`의 api·web에 `stop_grace_period: 30s`를 둔다(기본 10초. 진행 중 요청을 마칠 시간, Cloudflare 524 한도 100초보다 충분히 짧음).
- [x] api·web healthcheck에 `start_interval: 1s`를 둔다. compose에 `test`를 다시 쓰지 않고 이미지 `HEALTHCHECK`의 test·interval·start-period를 그대로 쓰는지 `docker inspect --format '{{json .Config.Healthcheck}}'`로 확인한다. 상속되지 않으면 compose에 test를 복사하지 말고 Dockerfile `HEALTHCHECK --start-interval=1s`(api·web 소유) 변경을 진행 기록에 인계한다[추정: 상속 여부 미확인].
- [x] `DATABASE_POOL_MAX` 운영값을 정해 넣는다. 사용자가 Supabase 대시보드(Database Settings → Connection pooling)의 Pool Size를 확인해 알려 주면 `2 × 값 ≤ Pool Size − 2`를 만족하는 값으로 둔다. 기본안: 모든 대상이 같은 Supabase를 쓰므로 `api.environment`에 고정하고 주석에 식과 확인한 Pool Size·날짜를 남긴다. 대상별로 달라지면 암호문 평문 키로 옮긴다(`.sops.yaml` `unencrypted_regex` 변경은 orchestrator 몫).
- [x] `CRELINK_APP_ENV=/dev/null docker compose -f infra/prod/compose.yaml --env-file infra/prod/images.env.example config --quiet`, `infra/prod/tests/*.sh` 통과.
- [x] 운영 배포 뒤(main 병합 → 자동 배포) 서버에서 `127.0.0.1:18080`에 0.2초 간격 curl 루프를 걸고 배포 1회의 502 구간 길이를 이전(약 30~40초)과 비교해 진행 기록에 남긴다. 배포는 트래픽이 적은 시각에 한다.
- [x] `infra/docs/prod-runbook.md`(값 표·종료 유예 설명), `infra/CHANGELOGS.md`.

## 범위

- 포함: `infra/prod/compose.yaml`, `infra/docs/prod-runbook.md`, `infra/CHANGELOGS.md`.
- 제외: Caddy 재생성 제거·edge 분리·색상화(0035), 앱 코드(0032·0033), Dockerfile HEALTHCHECK(인계만).

## 위험·복구

- main 병합 = 운영 적용입니다. 바뀌는 것은 정지 대기 시간, 기동 중 헬스 간격, pool 상한이며 데이터·비밀값은 바뀌지 않습니다.
- pool 상한을 너무 낮추면 피크 동시 쿼리가 대기할 수 있습니다. 운영 확인 때 API 지연이 늘면 값을 올리고 Pool Size를 함께 올립니다.
- 0032가 배포되기 전 이미지에서는 `stop_grace_period`가 정지만 늦추고(SIGTERM 무시 → 30초 뒤 SIGKILL) 공백을 늘립니다. 그래서 0032 선행이며, 0032 이미지가 운영에 있는지 확인한 뒤 병합합니다.
- 되돌리기: 이 커밋을 되돌려 재배포하거나 Rollback 워크플로로 직전 릴리스.

## 연결

- 에픽: [0031 운영 무중단 배포](../epics/0031-zero-downtime-deploy.md)
- 결정: [ADR 0011](../../adr/0011-zero-downtime-deploy.md) 결정 1(0단계)
- 조사: [지금 502가 나는 이유](../../references/zero-downtime-deploy.md#지금-502가-나는-이유-저장소-확인)
- 설계: [운영 배포 설계 "릴리스·배포·롤백"](../../specs/crelink-prod-deploy.md#릴리스배포롤백)
- 외부: [compose-spec healthcheck(`start_interval`, Compose v2.20.2·Engine 25 이상)](https://github.com/compose-spec/compose-spec/blob/main/05-services.md#healthcheck), [Cloudflare 524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/)

## 진행 기록

- 2026-10-07: 생성(에픽 0031 계획). 선행 0032(graceful shutdown·`DATABASE_POOL_MAX`). 사용자 확인 필요: Supabase Pool Size.
- 2026-10-07: 착수(브랜치 `work/0034-prod-compose-graceful-stop`). 에픽 공유 계약: `DATABASE_POOL_MAX` 운영값 6은 통합 담당이 암호문 평문 키로 넣고, 이 티켓은 `.sops.yaml` `unencrypted_regex`에 키만 추가.
- 2026-10-07: 구현(커밋은 아래 브랜치). 수용 기준·범위 변경과 이유:
  - healthcheck: Compose v5.5.1은 `start_interval`만 두면 `up`에서 `healthcheck.start_interval requires healthcheck.start_period to be set`으로 거부합니다(`config --quiet`는 통과시킴). 그래서 api·web에 이미지와 같은 `start_period`(30초·20초)를 함께 두고, Dockerfile `--start-period`를 바꾸면 compose도 바꾸라는 주석을 남김. test·interval·timeout·retries는 상속됨([실측] 로컬 Docker 29.8.1, 실제 이미지와 같은 `HEALTHCHECK` 플래그의 더미 이미지): `{"Test":["CMD","node","-e","fetch(...)"],"Interval":10000000000,"Timeout":5000000000,"StartPeriod":30000000000,"StartInterval":1000000000,"Retries":3}`(web은 `StartPeriod` 20초), `StopTimeout` 30. Dockerfile 인계 불필요. `tests/deploy-rollback.sh`에 api·web의 상속·`start_period`·`start_interval`·`StopTimeout` 확인을 추가.
  - `DATABASE_POOL_MAX`: 기본안(`api.environment` 고정) 대신 에픽 공유 계약대로 암호문 평문 키(운영값 6, 통합 담당이 암호문에 넣음)로 하고 루트 `.sops.yaml` `unencrypted_regex`에 키를 추가(orchestrator 위임으로 이 브랜치에서 수정). 근거: 운영 DB `max_connections` 60(Nano·Micro), Pool Size 15 [추정: 대시보드 미확인] → `2 × 6 = 12 ≤ 15 − 2`. 산정·확인 방법은 런북 12.
  - 배포 공백 측정 도구 `infra/prod/measure-gap.sh`(bash·curl) 추가. `tests/`는 서버로 보내지 않으므로 릴리스에 들어가는 `infra/prod/`에 두어 서버에서 `/opt/crelink/current/measure-gap.sh -d 180`으로 바로 씀. 사용법·해석은 런북 6-1. 범위 밖 수정(orchestrator 위임): `.sops.yaml`, `docs/specs/crelink-prod-deploy.md`(환경변수 표·배포 흐름·변경 기록), 루트 `CHANGELOGS.md`, `infra/prod/README.md`·`tests/deploy-rollback.sh`.
- 2026-10-07: 로컬 전후 비교 [실측]: 실제 compose(main 3c9ed95 vs 이 브랜치)를 릴리스 폴더 두 개로 복사해 `up -d --remove-orphans --wait`로 v1→v2 교체(caddy도 bind 원본이 바뀌어 재생성)하고 `measure-gap.sh -r 10`(0.1초 간격)으로 잼. 더미 이미지는 실제 Dockerfile과 같은 `HEALTHCHECK`(10초 간격, start-period api 30초·web 20초)에 기동 지연 api 3초·web 2초. macOS Docker 29.8.1·Compose v5.5.1. 최장 공백(go·links 중 큰 값):
  - 0단계 전(main compose, SIGTERM 핸들러 없음): 11.8·11.9·11.8초
  - 이 compose + SIGTERM 핸들러 없음: 9.4·6.7초
  - 이 compose + graceful(`server.close`): 7.1·9.5·6.7·6.7·6.7초
  - 실패는 대부분 `000`(caddy 재생성으로 리스너 없음, 운영에서는 cloudflared가 502로 응답)이고 `502`는 회당 2~5건. 공백은 배포 시작 0.2초 뒤부터 api·web 헬스 통과 뒤 caddy가 다시 뜰 때까지라 0035(caddy 고정)에서 없어질 몫입니다. 운영 값은 실제 api 기동(migration 포함)·Next 기동 시간에 따라 다릅니다.
  - 위험·복구 3번째 항목(0032 전 이미지는 SIGTERM 무시 → 30초 뒤 SIGKILL)과 달리, 핸들러가 없는 node는 tini가 넘긴 SIGTERM에 바로 끝나 `stop_grace_period`가 정지를 늦추지 않았습니다(위 "핸들러 없음" 2회 모두 배포 명령 17~20초). 실제 API 이미지(Nest, `enableShutdownHooks` 없음)도 같을 것으로 봅니다[추정]. 그래도 병합 순서는 0032 선행을 유지합니다.
- 2026-10-07: 검증 [실측]: `config --quiet` 통과, `bash -n`·`shellcheck -x infra/prod/*.sh infra/prod/tests/*.sh` 통과, `tests/caddy-routing.sh` 통과 42·실패 0, `tests/deploy-rollback.sh` 통과 88·실패 0(헬스체크 상속 확인 2건 포함), `measure-gap.sh` 단독 확인(`-d`·SIGTERM·`-- 명령` 종료, 잘못된 인자 종료 2), `pnpm verify` 통과 8·실패 0(worktree 인스턴스 DB). 남은 것(통합 담당): 암호문에 `DATABASE_POOL_MAX=6` 추가와 정규식 변경 뒤 재암호화(런북 12·9-2), Supabase Pool Size 대시보드 확인, 서버 Docker Engine 25 이상 확인(`docker version`), 0032 이미지 배포 뒤 병합·운영 배포 1회 공백 측정(런북 6-1)과 `pg_stat_activity` 확인.
- 2026-10-07: 운영 적용(통합 담당). 0032~0034를 통합 브랜치(`work/0036-…`, PR #13)로 병합 → 자동 배포(run, 릴리스 `433dc88`) 성공. 서버 Docker Engine 29.8.1.
  - `DATABASE_POOL_MAX=6`은 compose 고정 대신 암호문 평문 키로 넣음(`.sops.yaml` 정규식 추가·재암호화). 근거: 운영 DB `max_connections` 60(Supabase Nano/Micro compute), 그 compute의 Supavisor 기본 Pool Size 15로 보고 `2×6=12 ≤ 15−2`. Pool Size 자체는 대시보드 확인 전이라 `[추정]`(사용자 확인 대기). 배포 뒤 운영 api `DATABASE_POOL_MAX=6`, `pg_stat_activity` 전체 15·이 사용자 3.
  - 컨테이너 설정 확인: api `StopTimeout` 30, healthcheck `StartInterval` 1s.
  - 공백 측정 [실측](서버 `measure-gap.sh -r 5`, 대상 go `/zzzz`·links `/privacy`·links BFF health, 이미지가 바뀌는 릴리스 전환):
    - 0단계 전(2026-10-07 같은 날, `021f81e`↔`d098c73` 롤백 2회, 0.2초 curl 루프): 최장 연속 실패 12.9초·12.9초.
    - 0단계 뒤 graceful 이미지에서 전환(`433dc88`→`021f81e`): 12.6초(대부분 `000`, 502 1~3건). 그 반대(`021f81e`→`433dc88`, 옛 이미지 정지): 15.6초.
    - 사용자가 본 30~40초는 공개 주소(Cloudflare 경유) 체감이고 원본(`127.0.0.1:18080`) 기준으로는 약 13초. 0단계는 진행 중 요청을 지키지만 공백 길이는 거의 그대로: 공백의 대부분은 caddy 재생성과 api·web 정지→기동 순서(이번 배포 기준 api 기동 → 2.7초 뒤 web → 1.7초 뒤 caddy)이고, 0035(고정 edge Caddy + blue/green)에서 없어질 몫입니다.
