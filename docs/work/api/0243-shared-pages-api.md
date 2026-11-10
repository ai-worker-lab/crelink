# 0243 공유관리 페이지 API

- 단계: 티켓
- 역할: api
- 상위: 0241
- 선행: 0242
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

초대, 멤버, 대상 페이지 권한을 API에 구현합니다.

## 수용 기준

- [x] migration `0014_shared_pages.sql`, `PageAccessGuard`, 초대·멤버 경로, 경로 분류, 방명록 권한 판정, 보존 작업이 설계와 같습니다.
- [x] 새 `apps/api/test/page-members.e2e-spec.ts`가 설계의 권한 표 전체를 시험하고 통과합니다.
- [x] `pnpm verify`가 통과합니다.

## 범위

- 포함: `apps/api/**`, `packages/shared/**`.
- 제외: 웹, 페이지 삭제, `users` 스키마 변경, `sessionUser` 덮어쓰기.

## 위험·복구

새 테이블만 추가합니다. 운영 데이터가 생기기 전에는 DROP으로 되돌리고 이후에는 다음 migration으로 고칩니다.

## 연결

- 설계: [공유관리 페이지](../../specs/shared-pages.md)

## 진행 기록

- 2026-11-10: 생성. 구현은 Codex에 위임합니다(사용자 지시 "구현은 codex로 위임하자.").

- 2026-11-10: 구현. `0014_shared_pages.sql`에 새 테이블·인덱스·제약과 복구 주석을 추가했습니다. `src/pages/`의 가드가 인증 필드를 유지하며 요청마다 페이지 권한을 확인합니다(헤더 있음 쿼리 1회, 없음 0회). 편집자 경로는 대상 소유자 id를 서비스에 넘기고 소유자 경로는 `page_owner_only`로 거절합니다. 파일·통계·방명록·보존 작업과 초대 동시 소비를 연결했습니다. 웹·BFF는 수정하지 않았습니다.
- 2026-11-10: PostgreSQL HTTP 시험 `test/page-members.e2e-spec.ts` 8건을 작성했습니다. 권한 표·대상 격리·전체 편집 경로·소유자 전용 경로·즉시 해제·정지·파일 소유자·통계·비밀글/숨김·작성자·초대 오류/해시/동시성/보존을 포함합니다. 가드 이후 시험 전용 interceptor가 HTTP 헤더로 실제 `sessionUser.id`와 `actor.userId`를 노출해 불변을 관찰합니다. migration 시험에는 새 제약·삭제 연쇄·재실행을 추가했습니다. 기존 시험을 삭제하거나 기대를 약화하지 않았습니다.
- 2026-11-10: Node 24(`PATH="/opt/homebrew/opt/node@24/bin:$PATH"`)로 실행했습니다. `pnpm instance --print-env` 종료 0, 이 worktree DB 주소 `127.0.0.1:5652`를 확인했습니다. `pnpm --filter @crelink/shared build` 종료 0, `pnpm --filter @crelink/api typecheck` 종료 0입니다.
- 2026-11-10: `pnpm --filter @crelink/api test -- page-members` 최종 종료 1, 8건 중 통과 0/실패 8. 앱 기동 전 DB 연결에서 모두 `connect EPERM 127.0.0.1:5652 - Local (0.0.0.0:0)`로 막혔습니다. 샌드박스를 우회하지 않았고 실제 PostgreSQL 판정·migration 통과는 미확인입니다.
- 2026-11-10: `pnpm --filter @crelink/api test -- guestbook creator analytics migrations` 최종 종료 1, 6 suite 중 1 통과/5 실패, 시험 84건 중 5 통과/79 실패. DB가 필요한 시험은 같은 `connect EPERM`으로 막혔습니다. 첫 실행(새 migration 시험 추가 전)은 83건 중 5 통과/78 실패였습니다.
- 2026-11-10: 첫 `pnpm verify` 종료 1(실패 단계 typecheck 종료 2): 정적 5단계 통과 뒤 기존 웹의 `Record<CrelinkErrorCode, string>` 완전 매핑에서 새 오류 8개의 누락을 발견했습니다. 웹 수정 금지와 호환을 지키기 위해 공유 계약에 `PageErrorCode`를 별도 내보내고 API는 합집합 `CrelinkApiErrorCode`를 받도록 고쳤습니다. HTTP 오류 값은 설계와 같습니다. `CreatorLandingState.pageAccess`는 선택 필드입니다. 후속 0244에서 새 오류 문구를 연결해야 합니다.
- 2026-11-10: 수정 후 `pnpm verify`는 tokens/work/docs/design/lint/typecheck 6단계를 통과했습니다(웹·앱 포함). build 단계에서 shared·API 빌드까지 완료했으나 Next.js `Creating an optimized production build ...`가 완료되지 않아 수동 중단했습니다(`next build` 종료 130, 정상 전체 종료 결과 없음). 전체 test 단계는 실행되지 않았으므로 `pnpm verify` 통과로 표시하지 않습니다. 프로세스 확인 명령 `ps -eo pid,ppid,etime,command`도 샌드박스에서 `operation not permitted: ps`로 차단됐습니다.
- 2026-11-10: 사용자 허용 경로에 따라 루트 변경 기록·웹 오류 문구 표는 변경하지 않고 API 변경 기록·운영 안내를 갱신했습니다. 헤더 없는 요청은 설계의 DB 조회 금지에 맞춰 `publicId: null`, `shared: false` 기본 문맥을 사용하며 실제 공유 여부 표시는 헤더가 있는 요청 또는 pages 목록으로 확인합니다.
- 2026-11-10: `pnpm verify --fast` 종료 0, 정적 6단계 전부 통과(전체 웹·앱 typecheck 포함). `pnpm exec prettier --write <변경한 TS 파일>`·변경 파일 `eslint` 종료 0, `git diff --check` 종료 0입니다. `pnpm work:scope 0243` 종료 0, 변경 파일 23개 전부 소유 범위 안입니다.
- 2026-11-10: `pnpm smoke` 종료 1. API `127.0.0.1:3220/api/health`·웹 `127.0.0.1:5393` 모두 `응답 없음 (EPERM)`으로 브라우저 시험 전에 차단됐습니다. DB·서비스 접속이 허용되는 환경에서 PostgreSQL 시험, 전체 verify와 smoke를 재실행해야 합니다. 상태는 사용자 지시에 따라 `검증`으로 넘기며 수용 기준 중 시험/전체 검증 체크는 미완료로 유지합니다.
- 2026-11-10: CEO 재검증. Codex 샌드박스는 localhost 접속이 막혀 DB 시험을 실행하지 못했습니다. 샌드박스 밖에서 실행해 `apps/api/test/health.e2e-spec.ts`의 테이블·migration 목록에 새 항목을 더했습니다(CEO 수정 2곳). `pnpm verify` 8단계 통과, `page-members` 8건을 포함한 API 시험 전체 통과. 방명록·가드·초대·경로 분류 diff를 읽었습니다.
- 2026-11-10: 출시. PR #172, Deploy 42774626975 성공. 병합 때 로컬 CI가 실패(재사용한 인스턴스의 QA 합성 데이터와 브랜치 전환 때문으로 추정)했는데 스크립트가 멈추지 않아 `CI 통과` 없이 관리자 권한으로 병합됐습니다. 이 커밋은 깨끗한 환경의 후속 검증(0244 스택 12단계, GitHub CI)으로 확인했습니다. 코드 변경은 필요 없었습니다.
