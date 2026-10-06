# 0003 문서·경계·소유 경로 기계 검사

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

글로만 있던 저장소 규칙(문서 연결·ADR 형식·변경 기록 순서·영역 경계·역할 소유 경로)을 검사기로 옮겨, 에이전트가 규칙을 어기면 오류 메시지가 고치는 방법까지 알려 주게 합니다.

## 수용 기준

- [x] `pnpm docs:check`가 추적되는 Markdown(`design/.od-skills/` 제외)에서 깨진 상대 링크와 없는 제목 anchor, 진입점(`README.md`, `AGENTS.md`, `docs/README.md`)에서 닿지 않는 문서(`docs/work/` work item 제외), ADR 형식(제목 `# ADR NNNN: `, `날짜`·`상태`·`범위` 필드, 허용 상태, 폴더별 번호 중복), `CHANGELOGS.md`의 날짜 제목 최신순, `AGENTS.md` 크기 예산(루트 100줄·3500자, 영역 40줄 이하)을 검사한다. 각 오류는 파일·위치와 해결 방법을 출력한다.
- [x] ESLint가 영역 경계를 강제한다: 앱 사이 직접 import 금지, 웹·앱의 서버 전용 의존성 금지, API의 UI 의존성 금지, `packages/shared`의 프레임워크·DB 의존성 금지. 메시지는 대신 쓸 경로와 기준 문서를 알려 준다.
- [x] 역할별 소유 경로의 기계 원본이 `.omp/agents/*.md` frontmatter `owns`(쉼표로 구분한 glob)이고, `pnpm work:scope [NNNN] [--base <ref>]`가 기준 ref 이후 변경과 작업 중 변경 중 티켓 `역할`의 소유 경로 밖 파일을 실패로 보고한다. 번호가 없으면 브랜치 이름 `work/NNNN-*`(또는 `WORK_BRANCH`, `GITHUB_HEAD_REF`)에서 찾는다. `docs/work/**`는 모든 역할에 허용한다.

## 범위

- 포함: `scripts/docs-check.mjs`, `scripts/work-scope.mjs`, `eslint.config.mjs`, `.omp/agents/*.md` frontmatter.
- 제외: CI 연결(0002), `AGENTS.md` 축소(0004).

## 위험·복구

해당 없음.

## 연결

- [영역별 병렬 개발](../../development/parallel-work.md#역할과-에이전트별-소유-경계), [ADR 0004](../../adr/0004-lint-format.md)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: `pnpm docs:check` 실행 시 남은 오류는 루트 `AGENTS.md` 3500자 예산 초과(5592자) 1건뿐이며 0004에서 축소합니다. 임시 미추적 문서로 깨진 링크, 없는 anchor, 고아 문서, ADR 번호 불일치·날짜 형식·허용 외 상태·`대체됨` 링크 누락·`범위` 누락·폴더 내 번호 중복, 역순·중복 `CHANGELOGS.md` 날짜, 41줄 영역 `AGENTS.md`가 각각 오류로 보고되고 인라인 코드·코드 블록·외부 링크·중복 제목 anchor(`-1`)·디렉터리 링크는 오류가 아님을 확인한 뒤 삭제했습니다.
- 2026-10-01: `pnpm exec eslint .` 통과. 임시 파일로 web의 `@nestjs/common`·`../../api/src/...`·`@crelink/app/...`, shared의 `react`·`pg`, app의 `next/link`·`@nestjs/common`, api의 `react`·`react-dom/client`가 경계 메시지로 실패하고 web의 `../lib/api/server`는 통과함을 확인 후 삭제했습니다. `eslint --print-config`로 앱 파일에서 Expo 규칙과 경계 규칙이 병합됨을 확인했습니다.
- 2026-10-01: `/tmp` 임시 clone의 `work/0001-x` 브랜치에서 0001 역할을 `web`으로 바꾸고 `apps/web/**` 변경은 `pnpm work:scope` 통과, `Makefile` 변경과 `infra/README.md` 이름 변경(양쪽 경로 보고)은 exit 1로 실패, `WORK_BRANCH=work/0003-y`가 브랜치보다 우선함을 확인 후 clone을 삭제했습니다. `pnpm work:check` 통과.
- 2026-10-01: 완료. 통합 후 `pnpm docs:check`·`pnpm verify --fast` 통과, 실행기 종단 실행에서 `pnpm work:scope 0006` 통과를 확인했고 `main`에 통합.
