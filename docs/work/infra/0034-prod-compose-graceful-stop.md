# 0034 운영 compose 0단계: 종료 유예·빠른 헬스 판정·DB pool 운영값

- 단계: 티켓
- 역할: infra
- 상위: 0031
- 선행: 0032
- 상태: 진행
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

blue/green(0035) 전에 단독으로 배포할 수 있는 0단계입니다. 지금 배포 공백 30~40초에는 헬스 판정 지연(이미지 HEALTHCHECK `--interval=10s`, `start_interval` 없음, 준비 뒤 최대 약 10초 더 대기)과 API 즉시 종료가 들어 있습니다. compose에서 종료 유예와 기동 중 헬스 간격을 고쳐 공백을 줄이고(십수 초 예상 [추정]), 0032의 `DATABASE_POOL_MAX` 운영값을 넣어 0035에서 두 색이 겹쳐도 Supabase 연결 상한을 넘지 않게 합니다. 이 티켓만으로 502가 없어지지는 않습니다.

## 수용 기준

- [ ] `infra/prod/compose.yaml`의 api·web에 `stop_grace_period: 30s`를 둔다(기본 10초. 진행 중 요청을 마칠 시간, Cloudflare 524 한도 100초보다 충분히 짧음).
- [ ] api·web healthcheck에 `start_interval: 1s`를 둔다. compose에 `test`를 다시 쓰지 않고 이미지 `HEALTHCHECK`의 test·interval·start-period를 그대로 쓰는지 `docker inspect --format '{{json .Config.Healthcheck}}'`로 확인한다. 상속되지 않으면 compose에 test를 복사하지 말고 Dockerfile `HEALTHCHECK --start-interval=1s`(api·web 소유) 변경을 진행 기록에 인계한다[추정: 상속 여부 미확인].
- [ ] `DATABASE_POOL_MAX` 운영값을 정해 넣는다. 사용자가 Supabase 대시보드(Database Settings → Connection pooling)의 Pool Size를 확인해 알려 주면 `2 × 값 ≤ Pool Size − 2`를 만족하는 값으로 둔다. 기본안: 모든 대상이 같은 Supabase를 쓰므로 `api.environment`에 고정하고 주석에 식과 확인한 Pool Size·날짜를 남긴다. 대상별로 달라지면 암호문 평문 키로 옮긴다(`.sops.yaml` `unencrypted_regex` 변경은 orchestrator 몫).
- [ ] `CRELINK_APP_ENV=/dev/null docker compose -f infra/prod/compose.yaml --env-file infra/prod/images.env.example config --quiet`, `infra/prod/tests/*.sh` 통과.
- [ ] 운영 배포 뒤(main 병합 → 자동 배포) 서버에서 `127.0.0.1:18080`에 0.2초 간격 curl 루프를 걸고 배포 1회의 502 구간 길이를 이전(약 30~40초)과 비교해 진행 기록에 남긴다. 배포는 트래픽이 적은 시각에 한다.
- [ ] `infra/docs/prod-runbook.md`(값 표·종료 유예 설명), `infra/CHANGELOGS.md`.

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
