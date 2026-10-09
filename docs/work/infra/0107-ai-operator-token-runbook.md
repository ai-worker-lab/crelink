# 0107 AI 운영자 토큰 런북·운영 주소 검사

- 단계: 티켓
- 역할: infra
- 상위: 0088
- 선행: 0101, 0104
- 상태: 완료
- 종류: 운영
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

운영 서버에서 사람 로그인 없이 AI 운영자 토큰을 안전하게 발급·폐기·회전하고, 새 웹 토큰 경로가 배포마다 살아 있는지 확인합니다. 요구는 R23 ①입니다.

## 수용 기준

- [x] `infra/docs/prod-runbook.md` 17절(발급 한 줄 명령, 확인, `list-tokens`·`revoke-token`, 회전, 실패 처리, 토큰 위치)이 있고 `infra/prod/README.md`·`docs/development/environment-secrets.md`가 연결합니다.
- [x] `infra/prod/verify.sh`에 `{WEB}/api/agent/api/health`(토큰 없음) 401 검사가 있고 `bash -n`·`shellcheck -x`가 통과합니다. `infra/prod/tests/caddy-routing.sh`가 웹 호스트에서 `Authorization`·`X-Crelink-Agent-Run` 헤더 전달을 확인합니다. 운영 배포 설계의 공개 경로·검사 수를 고칩니다.

## 범위

- 포함: 위 수용 기준.
- 제외: 운영 토큰 실제 발급(머지 뒤 부모).

## 위험·복구

토큰이 화면·셸 기록·서버 디스크에 남지 않게 합니다. 실패하면 `list-tokens`로 확인하고 남은 토큰을 폐기합니다.

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `CLI`·`비기능 요구`, `티켓 분해` 0107
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ①

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해).
- 2026-10-10: 구현(통합 브랜치 `work/0091-ai-operator-design`, 커밋 없음).
  - 런북 `infra/docs/prod-runbook.md` "17. AI 운영자 토큰"(17-1 선행 ~ 17-6 실패·유출 처리), 값 표·4-5 회전 표 줄, 5·14-4의 검사 수 11개. 발급 명령은 운영자 Mac에서 `umask 077` subshell 안에서 `ssh home-server 'sudo -n docker exec "crelink-$(cat /opt/crelink/state/active-color)-api-1" node apps/api/dist/cli/ai-operator.js issue-token --label …'`(`-t` 없음) 출력을 변수로 받아 `grep -Eqx 'crl_ai_[A-Za-z0-9_-]{43}'` 뒤 `ai-operator.env.new`에 `printf`(내장)로 쓰고 `mv`. 실패하면 `.new`를 지우고 17-6 안내. CLI 명령·출력 형식은 설계 `CLI(토큰 발급)` 기준(api 담당 0101이 구현 중이라 실제 CLI로는 실행하지 않음).
  - `infra/prod/verify.sh`에 `웹 AI 토큰 경로 토큰 없음 401`(`{WEB}/api/agent/api/health`) 검사(11개), `infra/prod/README.md` 검사 수·런북 17 연결, `infra/prod/tests/caddy-routing.sh` 스텁의 `x-echo-auth`·`x-echo-agent-run`과 웹 호스트 POST `/api/agent/api/admin/agent-runs` 2개 확인(시험 토큰 값은 실제 토큰 형식이 아님).
  - orchestrator가 맡긴 문서: `docs/specs/crelink-prod-deploy.md`(웹 호스트 공개 경로에 `/api/agent` 줄, 운영 주소 검사 표 11개, 변경 기록), `docs/development/environment-secrets.md` 새 절 `AI 운영자 토큰`, `docs/development/verification.md` CD 표 검사 목록·11개. `infra/CHANGELOGS.md`.
  - `bash -n infra/prod/*.sh infra/prod/tests/*.sh infra/prod/tests/lib/*.sh` 통과, `shellcheck -x`(0.11.0) 같은 대상 통과.
  - `infra/prod/tests/caddy-routing.sh`(Docker, 실행마다 격리한 컨테이너·네트워크만 만들고 지움): 통과 80, 실패 0. 새 확인 `POST /api/agent/api/admin/agent-runs (AI 토큰 경로)` → `200 web POST /api/agent/api/admin/agent-runs`, `Authorization·X-Crelink-Agent-Run 그대로 전달` ok.
  - `pnpm docs:check` 통과(Markdown 206개).
  - `pnpm work:scope 0107`: 실패(종료 1). 소유 밖 19개는 같은 통합 브랜치의 다른 담당 변경(web·api·orchestrator 문서)과, 이 티켓에 한해 orchestrator가 맡긴 `docs/specs/crelink-prod-deploy.md`·`docs/development/environment-secrets.md`·`docs/development/verification.md`입니다. infra 소유 경로 안 변경만 이 티켓 것입니다.
  - Caddyfile·compose 변경이 없어 `config --quiet`는 해당 없음. 새 `verify.sh` 검사는 웹 `/api/agent`(0104)가 없는 릴리스에서 실패하므로 통합 PR로만 머지합니다.
  - 하지 않은 것: 운영 토큰 실제 발급과 운영 주소 검사 결과 확인은 머지·배포 뒤 부모(0091·에픽 0088)가 런북 17로 합니다.
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). 런북 17의 발급 형식(표준 출력 한 줄 → 형식 검사 → 600 파일)을 로컬에서 `ssh` 대신 `node apps/api/dist/cli/ai-operator.js issue-token`으로 같은 순서로 실행해 권한 600 파일을 만들고 `precheck` 0을 확인. `verify.sh` 새 검사는 로컬 웹 `/api/agent/api/health` 토큰 없음 401과 같은 조건입니다. 운영 발급·운영 주소 검사는 머지 뒤 부모. 상태 `완료`.
