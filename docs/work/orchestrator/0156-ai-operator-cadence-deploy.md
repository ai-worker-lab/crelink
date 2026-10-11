# 0156 AI 운영자 20분 주기 전환과 localhost·prod 배포 확인

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-11

## 목적

AI Worker Lab의 1인 운영자가 Crelink 운영을 20분 주기로 이어갈 수 있도록 실행 호스트 계약을 맞추고, localhost 검증과 GitHub CI/CD를 거쳐 `links.shaul.kr`에 반영되는 전체 경로를 한 번 확인합니다.

## 수용 기준

- [x] 실행 도구가 `*/20 * * * *`(`Asia/Seoul`) 자동화 명령을 출력합니다.
- [x] AI 운영자 헌장·프롬프트·운영자 화면이 20분 주기를 표시하고 한 실행은 15분 안에 끝내도록 안내합니다.
- [x] localhost에서 `work:check`·`docs:check`·Prettier·ESLint·API·웹 타입 검사·빌드, smoke 5건, AI 운영자 E2E 1건을 통과합니다.
- [x] PR의 GitHub CI가 통과한 뒤 main 병합으로 Deploy가 실행됩니다.
- [x] Deploy의 운영 주소 검사와 `https://links.shaul.kr/` 공개 화면 HTTP 200을 확인합니다.
- [ ] 인증된 운영자 세션으로 `links.shaul.kr/admin/agent-runs`에서 20분 주기 안내를 확인합니다.

## 범위

- 포함: `scripts/ai-operator.mjs`, AI 운영 문서·ADR·PRD, 운영자 화면 주기 표기, 운영 런북·사람 선행 작업, 변경 기록, localhost·CI/CD·prod 확인 기록.
- 제외: AI 운영자 토큰 발급·폐기, 운영 DB 직접 쓰기, 사용자 데이터 생성·삭제, 제품 기능 추가.

## 위험·복구

실행 주기를 바꾸면 자동화가 이전 설정으로 남아 실행 빈도가 달라질 수 있습니다. 배포 전 `automation-command` 출력과 운영자 화면 문구를 확인하고, 이상 시 사람 운영자가 Orca 자동화를 끄거나 운영자 화면의 멈춤 스위치를 켭니다. 운영 서버 토큰과 비밀값은 저장소·로그·실행 기록에 넣지 않습니다.

## 연결

- [AI 운영자 헌장](../../ops/ai-operator.md)
- [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md)
- [운영 배포·CD 검증 루프](../../development/verification.md#cd운영-배포)
- `scripts/ai-operator.mjs`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

## 진행 기록

- 2026-10-11: 생성·착수. 사용자 요청에 따라 기존 30분 AI 운영 주기를 20분으로 전환하는 단일 운영 작업으로 계획했습니다. 실행 상한은 다음 주기와 겹치지 않도록 15분으로 정했습니다.
- 2026-10-11: localhost 인스턴스를 `127.0.0.1:3020` API·`127.0.0.1:5193` 웹으로 기동했습니다. `node scripts/work.mjs --check`(127개)·`node scripts/docs-check.mjs`(231개)·Prettier·ESLint·API typecheck·웹 typecheck·API build·웹 build, smoke 5/5, `tests/e2e/ai-operator.spec.ts` 1/1을 통과했습니다. 시스템 `pnpm` 실행 파일이 없어 `pnpm verify`·`pnpm smoke` 래퍼 대신 동일한 직접 명령과 Playwright를 실행했습니다.
- 2026-10-11: PR [#85](https://github.com/ai-worker-lab/crelink/pull/85)의 GitHub CI가 `check (Node 24)`, `check (Node 26)`, smoke, API·웹 이미지 빌드, work scope, CI 통과를 모두 통과했습니다. main 병합 후 Deploy [#38115473214](https://github.com/ai-worker-lab/crelink/actions/runs/38115473214)의 plan·API/웹 이미지·home-server 운영 주소 검사·배포 기록 태그가 모두 성공했습니다. `https://links.shaul.kr/`는 HTTP 200과 `크리링` 제목을 반환했습니다. 비인증 브라우저는 `/admin/agent-runs`에서 공개 첫 화면으로 이동해 운영자 세션 전용 문구는 아직 확인하지 못했습니다.
