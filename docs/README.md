# 문서 인덱스

이 문서는 탐색용 색인입니다. 공통 정책 원문은 [저장소 공통 정책](development/repository-policy.md)이고, 루트 [AGENTS.md](../AGENTS.md)는 에이전트용 지도입니다. 해당 영역 작업 시 루트에서 연결한 하위 `AGENTS.md`의 추가 규칙도 함께 확인합니다.

## 주요 문서

- [저장소 공통 정책](development/repository-policy.md) — 언어·기준 정보·문서 배치·ADR·진입점·변경 기록·의존성 버전(LTS 기준)
- [제품 탐색과 PRD](product/README.md) — PRD 확정 전 유사 서비스 벤치마킹과 라이브러리·오픈소스·SaaS 기술 조사, [PRD 템플릿](product/TEMPLATE.md)·[벤치마킹 템플릿](product/research/TEMPLATE.md)·[기술 조사 템플릿](references/TEMPLATE.md)
- [기술 설계와 티켓 분해](specs/README.md) — PRD·디자인 인계를 받아 `orchestrator`가 설계 문서(`docs/specs/`)를 쓰고 역할별 검토·사용자 승인 후 계약 → 병렬 구현 → 통합 티켓으로 나누는 절차, [설계 템플릿](specs/TEMPLATE.md)
- [로컬 개발 환경](development/local-environment.md) — PostgreSQL/Valkey Compose와 로컬 웹·모바일 앱·API 실행, worktree별 로컬 인스턴스, 로그 조회
- [검증 루프](development/verification.md) — `pnpm verify`·`pnpm smoke`·CI와 완료 보고 전 확인 범위
- [환경과 비밀값 관리](development/environment-secrets.md) — local/dev/prod 격리와 서비스별 설정 소유권
- [영역별 병렬 개발](development/parallel-work.md) — 자동 발견되는 OMP 역할, `jev_route` 직접 라우팅, 소유 경로(`owns`), 복합 작업의 `orchestrator` 통합
- [work item 실행기](development/agent-runner.md) — [WORKFLOW.md](../WORKFLOW.md) 정책으로 착수 가능한 티켓마다 worktree와 코딩 에이전트를 실행하는 `pnpm work:run`
- [문서 정리 작업](development/doc-gardening.md) — 실행기가 주기적으로 맡기는 문서·코드 불일치 정리 절차
- [기존 저장소에 하네스 적용](development/adopting-harness.md) — 이미 운영 중인 저장소에 하네스를 들일 때의 파일 묶음, 치환 규칙(이름·패키지 범위·포트·토큰 접두사), ADR 재번호, 기존 디자인 산출물 기준선, 검증 순서
- [디자인 토큰 사용법](../packages/design-tokens/docs/usage.md) — `@crelink/design-tokens` 원본 수정·생성·검사와 웹·앱 사용 방법
- [OpenDesign 사용 기준](../design/docs/opendesign.md) — 로컬 OpenDesign 준비, 디자인 시스템 패키지(`design/system/`)와 `pnpm design:sync`, 산출물 인계(`design/<기능>/handoff.md`), `pnpm design:check`
- [디자인 ADR 0001 OpenDesign 연결 방식](../design/docs/adr/0001-opendesign-integration.md) — 토큰에서 디자인 시스템 패키지를 생성하고 저장소 스냅숏으로 인계하는 결정
- [ADR 0001 디자인 토큰 단일 원본](adr/0001-design-tokens.md) — 디자인·웹·앱이 한 토큰 원본과 컴포넌트 규칙을 쓰는 결정(모서리 결정 6은 ADR 0013이 대체)
- [ADR 0013 둥근 모서리](adr/0013-rounded-corners.md) — 계단형 픽셀 모서리를 `border-radius`·`corner` 토큰의 둥근 모서리로 바꾼 결정
- [인프라 관리](../infra/README.md) — 환경별 설정 위치와 원격 구성 상태
- [ALM 운영 기준](alm/workflow.md) — 요구사항·work item·검증·배포·운영 피드백을 연결하는 도구 중립 절차
- [작업 관리](work/README.md) — 에픽·티켓·하위 티켓 work item의 형식·필드·폴더(`epics/`·역할별)·검사 규칙과 `pnpm work`·`work:next`·`work:place`·`work:scope` 명령
- [ADR 0002 work item을 저장소 문서로 관리](adr/0002-work-items-in-repository.md) — GitHub Issues 대신 `docs/work/`를 쓰는 결정
- [ADR 0003 work item 3단계](adr/0003-work-item-hierarchy.md) — 에픽·티켓·하위 티켓 구조와 "티켓" 용어를 정한 결정(폴더 부분은 ADR 0009가 대체)
- [ADR 0004 lint·format](adr/0004-lint-format.md) — ESLint + Prettier 선택과 ESLint 9 사용 이유
- [ADR 0005 로컬 인프라에 Valkey 유지](adr/0005-keep-valkey-local-infra.md) — API 연결은 용도가 생길 때 추가
- [ADR 0006 AGENTS.md를 지도로](adr/0006-agents-md-as-map.md) — 공통 정책 원문을 `docs/`로 옮기고 루트 `AGENTS.md`를 크기 예산 안의 지도로 두는 결정
- [ADR 0007 저장소 work item 실행기](adr/0007-repository-work-item-runner.md) — 저장소 work item을 제어 평면으로, 브랜치를 착수 점유로, 에이전트 명령을 설정으로 두는 결정
- [ADR 0008 worktree별 로컬 인스턴스](adr/0008-worktree-local-instances.md) — worktree마다 포트 슬롯·Compose project·볼륨을 나누는 결정
- [ADR 0009 work item을 역할별 폴더에 둠](adr/0009-work-item-role-folders.md) — 에픽은 `docs/work/epics/`, 티켓은 `docs/work/<역할>/`에 두고 계층은 계속 필드로 표현하는 결정
- [ADR 0010 운영(prod) 배포 구성과 CD](adr/0010-prod-deployment-topology.md) — 배포 대상 서버 1대의 웹·API Compose 스택, Cloudflare Tunnel 공개, Tailscale OIDC 배포 접속, SOPS/age 비밀값, main 병합 자동 배포와 롤백(제안)
- [ADR 0011 운영 배포 무중단 방식](adr/0011-zero-downtime-deploy.md) — 고정 edge Caddy + Blue/Green 앱 스택, Caddy reload 전환, 선행 0단계(graceful shutdown·`start_interval`·DB pool 상한)(승인, home-server 운영 적용. ADR 0010의 Kamal 후보 문구와 단일 스택·헬스 실패 복구 방식 대체)
- [ADR 0012 오류·성능 모니터링에 Sentry](adr/0012-error-monitoring-sentry.md) — Sentry SaaS(미국 리전), 오류 전부 + 성능 추적 10%, IP·내부 사용자 ID만, CI 이미지 빌드에서 소스맵 업로드, DSN 없으면 꺼짐, `/privacy` 국외 이전 고지(승인)
- [외부 서비스·도구 의존](architecture/external-dependencies.md) — 현재 사용 중이거나 계획된 외부 SaaS·도구와 기준 위치
- [자주 묻는 질문](faq.md) — 저장소 구조, 개발 도구, 로컬 실행, 배포 목표, 언어 정책
- [배포 대상 아키텍처](architecture/deployment-target.md) — 운영 배치(배포 대상 서버·Supabase·Cloudflare Tunnel)와 운영상 경계
- [NestJS API 구조와 구현 기준](architecture/nestjs-api.md) · [Next.js 웹 구조와 구현 기준](architecture/nextjs-web.md) · [Expo 모바일 구조와 구현 기준](architecture/expo-mobile.md) — 프레임워크별 구조와 현재 골격
- [Redis와 Valkey 비교](references/redis-vs-valkey.md) — 프로젝트 역사, 라이선스, 호환성, 기능 비교 자료
- [운영 배포 무중단화 방식 비교](references/zero-downtime-deploy.md) — 배포 중 502 원인, 로컬 실측, Caddy 재시도·docker-rollout·Blue/Green·Kamal·Swarm 비교
- [CHANGELOGS](../CHANGELOGS.md) — 공개 여부와 무관한 내부 전체 변경 기록. 영역별 로그는 `infra/` 및 `apps/` 아래에 있음
- [RELEASES](../RELEASES.md) — 사용자에게 공개한 릴리스 노트

제품 문서: [크리링 PRD](product/crelink.md)(확정, MVP 범위)와 [크리링 MVP 기술 설계](specs/crelink-mvp.md)(승인). 참고 자료: [크리링 서비스 기획 및 MVP Handoff](product/crelink-mvp-handoff.md)(PDF 사본 `product/crelink-mvp-handoff.pdf`) — AI가 제안한 검토 재료이며 확정된 결정이 아닙니다. 작성 절차는 [제품 탐색과 PRD](product/README.md), 제품 소개는 [루트 README](../README.md)에 둡니다.

운영 배포: [크리링 운영 배포·CD 기술 설계](specs/crelink-prod-deploy.md) — 구성, Caddy 공개 정책, 환경변수, CD 흐름, 위험(승인, 에픽 0024).

## 문서 위치

- 제품·여러 영역 공통 문서: `docs/`(PRD·벤치마킹 `docs/product/`, 기술 설계 `docs/specs/`)
- 여러 영역에 영향을 주는 ADR: `docs/adr/`
- 백엔드 전용 문서와 ADR: `apps/api/docs/`, `apps/api/docs/adr/`
- 모바일 앱 전용 문서와 ADR: `apps/app/docs/`, `apps/app/docs/adr/`
- 브라우저 웹 전용 문서와 ADR: `apps/web/docs/`, `apps/web/docs/adr/`
- 인프라 전용 문서와 ADR: `infra/docs/`, `infra/docs/adr/`
- 디자인 전용 문서와 ADR: `design/docs/`, `design/docs/adr/`
- 공용 패키지 전용 문서: `packages/<name>/docs/`
- 외부 기술·라이선스 비교 자료: `docs/references/`

하위 문서 폴더는 해당 범위의 첫 문서가 생길 때 만듭니다.
