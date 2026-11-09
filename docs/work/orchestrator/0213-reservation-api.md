# 0213 사전 신청 문서·계약·API 묶음

- 단계: 티켓
- 역할: orchestrator
- 상위: 0212
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-10

## 목적

링크별 사전 신청의 PRD·설계 문서, 공유 계약, API를 플래그 꺼진 상태로 머지 가능한 한 묶음으로 만듭니다. 설계 티켓 표의 0213(PRD), 0214(설계 문서), 0215(계약), 0216(migration·플래그·설정 PUT·공개 필드), 0217(공개 제출·제한 공용화), 0218(목록·CSV·삭제·보존·휴대폰 가림)을 이 티켓 하나로 묶습니다. 웹·QA·통합·출시는 설계의 0219 이후 번호로 남겨 둡니다.

## 수용 기준

- [x] PRD R29~R32가 위임 근거와 함께 `[AI 제안]`·`[미정]`으로 표시됩니다(`pnpm docs:check`).
- [x] 설계 문서와 에픽이 있습니다(`pnpm work:check`).
- [x] 공유 타입·오류 코드·경로·한도가 `packages/shared`에 있습니다(`pnpm typecheck`).
- [x] `RESERVATIONS_ENABLED` 미설정·`TRUE`·`1`·` true`면 새 경로가 모두 404, 공개 응답·편집 상태에 필드가 없습니다.
- [x] migration은 추가만 하고 기존 행·컬럼을 바꾸지 않습니다.
- [x] 설계 7절 중 API에서 시험 가능한 권한·꺼짐·중복·대량 제출·유출·CSV 시나리오가 시험으로 있습니다.
- [x] 남의 데이터 접근은 404입니다.
- [x] 연락처 값이 로그·오류 메시지·Sentry 페이로드·URL에 없습니다. Sentry 로그 정리에 휴대폰 패턴이 있습니다.
- [x] `pnpm verify`, `pnpm --filter @crelink/api test`, `pnpm work:scope 0213`, `pnpm work:check`, `pnpm docs:check`가 통과합니다.

## 범위

- 포함: 위 목적의 PRD·설계·에픽·계약·API·변경 기록·API 문서.
- 제외: 웹 화면(`apps/web`), 처리방침, 운영 플래그 변경, 운영 접근, 병합·배포, E2E.

## 위험·복구

운영 데이터 영향은 migration 추가뿐입니다. 플래그가 꺼져 있어 수집이 일어나지 않습니다. 문제가 있으면 코드를 revert합니다. 컬럼과 테이블은 추가 전용이라 이전 API에서 그대로 두면 되고, 지우려면 별도 migration이 필요합니다(운영 데이터 변경이므로 사용자 승인).

## 연결

- 에픽: [0212](../epics/0212-link-reservations.md)
- 설계: [링크별 사전 신청](../../specs/crelink-reservations.md)
- PRD: [R29~R32](../../product/crelink.md#요구사항)
- 결정: [ADR 0016](../../adr/0016-devoffice-takeover.md) 결정 1
- 코드: `apps/api/src/reservations/`, `apps/api/src/telemetry/landing-limits.ts`, `apps/api/migrations/0013_link_reservations.sql`, `packages/shared/src/crelink.ts`

## 진행 기록

- 2026-11-10: 생성·착수. 설계 원문을 코드와 대조했고 설계의 처리 순서·계약·`[임시값]`을 그대로 구현합니다.
- 2026-11-10: 구현과 시험 완료. 설계와 달리 정한 세부: 플래그가 꺼진 404 본문은 없는 경로와 같은 `not_found`(설계 표의 `reservation_unavailable`은 켜진 상태의 공개 제출 오류), `off`는 방식 0개 허용, `open`·`closed`는 1개 이상. 입력 형식은 설계의 처리 순서대로 레이트 리밋·봇 판정 뒤에서 검사합니다. Sentry `extraErrorData`는 코드에 사용처가 없음을 확인했습니다(`apps/api/src` 검색).
- 2026-11-10: 전체 시험 중 `sorry, too many clients already`로 기존 시험 파일(방명록, 크리에이터 등)이 실패했습니다(PostgreSQL `max_connections` 100, Jest 11 워커). `apps/api/package.json` Jest `maxWorkers`를 `50%`로 제한해 재현이 사라졌습니다(2회 연속 321개 통과). 동시 20건 시험은 `DATABASE_POOL_MAX=4`로 돌려 다른 파일과 연결을 다투지 않게 했습니다. `main` 기준 재현은 하지 않았습니다.
- 2026-11-10: `apps/web/src/lib/api/errors.ts`에 새 오류 코드의 안내 문구 6개를 더했습니다. 계약의 `Record<CrelinkErrorCode, string>`이 컴파일되도록 하는 최소 변경이며 화면 연결은 0219·0220입니다.
- 2026-11-10: 검증. `pnpm verify` 8단계 통과, `pnpm --filter @crelink/api test` 35개 파일 321개 통과, `pnpm --filter @crelink/shared test` 통과, `pnpm work:scope 0213`·`pnpm work:check`·`pnpm docs:check` 통과. 플래그 미설정으로 실제 API(`make api-up`, 포트 3220, 로컬 DB에 `reservation_state='open'` 행 시드)에 요청해 새 경로 6개 모두 404 `not_found`, `GET /api/public/landings/{publicId}`의 링크에 `reservation` 필드 없음, `link_reservations` 0행을 확인했습니다. `pnpm ci:local`은 ego 단계가 있고 ego-lite를 다른 작업이 쓰고 있어 실행하지 않았습니다.
