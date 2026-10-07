# 0039 의존성 메이저 업그레이드(LTS 기준)

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

런타임·프레임워크를 지원 중인 LTS(안정 major)로 올려 보안 패치를 계속 받습니다. Next.js 15는 2026-10-21에 Maintenance LTS가 끝나고, Dependabot이 연 메이저 PR(#3~#10)은 비-LTS(`node:25`)나 Expo SDK와 맞지 않는 버전(react 19.3·react-native 0.87)을 섞어 그대로 받을 수 없습니다.

## 수용 기준

- [x] Node.js 24 LTS: `.nvmrc`, `apps/api`·`apps/web` Dockerfile `node:24-slim`, `@types/node` ^24, 웹 `engines` `>=24.9`, CI check 행렬 24·26(22 제외 근거: NestJS 12 ESM과 Jest).
- [x] Next.js 16.x(Active LTS), NestJS 12.x, Expo SDK 57, React 19.2.3(웹·앱 공통), `alpine:3.24`, 도구 마이너. 공식 마이그레이션 가이드·codemod 적용, 깨진 변경은 코드로 고침.
- [x] Dependabot: Node docker major와 Expo SDK 관리 패키지 무시, 의존성 버전 정책 문서.
- [x] 통합 브랜치에서 `pnpm verify`·`pnpm e2e` 통과, CI(Node 24·26, smoke, 이미지 빌드) 통과.
- [ ] 운영 배포 뒤 `verify` 6개, 이미지 Node 24·React 19.2.3, 단축 주소 302(`?pass=`)·랜딩 직접 접속 307 확인.

## 범위

- 포함: 위 버전 변경과 그에 따른 코드·설정·문서·CHANGELOGS, Dependabot 설정, Dependabot PR #3~#10 정리.
- 제외: TypeScript 6(대상 프레임워크가 요구하지 않음), Expo 개발 빌드·실기기 검증(앱은 아직 배포 안 함).

## 위험·복구

운영 이미지의 Node·Next·Nest가 함께 바뀝니다. 배포는 Blue/Green이라 새 색이 헬스에 실패하면 활성 색이 그대로이고, 문제가 배포 뒤 드러나면 Rollback 워크플로로 직전 릴리스(`0a53e99` 계열)로 되돌립니다. DB 스키마 변경은 없습니다.

## 연결

- 정책: `docs/development/repository-policy.md#의존성-버전`
- 근거: [Node.js Releases](https://nodejs.org/en/about/previous-releases), [Next.js Support Policy](https://nextjs.org/support-policy), [NestJS migration guide](https://docs.nestjs.com/migration-guide), Expo SDK 57 `bundledNativeModules.json`
- Dependabot PR #3~#10

## 진행 기록

- 2026-10-07: 생성·착수. 사용자 지시(원문): "메이저 버전으로 업그레이드 하자. LTS 기반 기준으로 업그레이드 해야한다." 조사: Node v24 LTS·v22 Maintenance LTS·v26 Current·v25 EOL, Next 16.x Active LTS(15.x는 2026-10-21 종료), NestJS 12.1.2(현재 major, Node >= 20), Expo SDK 57(react 19.2.3, react-native 0.86.3). 영역별 작업자 4명이 worktree에서 병렬로 진행(Node 24·도구·Dependabot / Next 16 / Nest 12 / Expo 57)하고 통합 브랜치 `work/0039-lts-major-upgrades`에서 합침.
- 2026-10-07: 결정. NestJS 12가 ESM 전용이라 ts-jest(CJS) 시험이 Jest `--experimental-vm-modules`와 Node 24.9 이상에서만 돔(Node 22 전 스위트 실패 실측) → 지원 Node를 24 LTS 이상으로, CI 행렬에서 22 제외(Vitest 이전은 하지 않음). `@nestjs/cli` 12가 TypeScript 6을 끌어와 루트 hoist가 6.0.3이 되므로 루트 `typescript ~5.9.2` 고정. Next 16 개발 서버가 `.next/dev`를 따로 쓰므로 0019의 `NEXT_DIST_DIR=.next-dev` 장치를 걷어냄. 웹 SIGTERM 종료 코드가 0 → 143(정상 정리 후 신호 종료)으로 바뀜.
- 2026-10-07: 영역별 결과. Node 24: Node 24.20에서 `pnpm verify` 통과, `node:24-slim` api·web 이미지 healthy, `caddy-routing.sh` 50/50, `deploy-rollback.sh` 97/97. Next 16.4: codemod 5종은 바꿀 곳 없음, `allowedDevOrigins ['127.0.0.1']`(없으면 e2e 7건 실패), 린트 새 규칙 2건 이유와 함께 끔, `pnpm e2e` 7·smoke 5 통과, `/p/{id}` 307·same-origin 200 유지. Nest 12.1: 코드 변경 없음, Jest 플래그, 라우트 표 회귀 시험 추가(92개). Expo 57: `expo-doctor` 21/21, iOS·Android export 성공, StatusBar `backgroundColor` 제거, `set-state-in-effect` 대응.
