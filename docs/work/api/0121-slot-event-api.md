# 0121 링크 슬롯 이벤트 API·migration 0005

- 단계: 티켓
- 역할: api
- 상위: 0089
- 선행: 0120
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

링크 슬롯 +5 이벤트 기술 설계의 티켓 분해 0121입니다. 이벤트 데이터, 신청, 한도 합산, 공개·운영자 API를 만듭니다.

## 수용 기준

- [x] migration `apps/api/migrations/0005_slot_event.sql`: `lock_timeout` 첫 줄, 되돌리기 주석, `slot_events`·`slot_event_entries`(설계 `데이터 모델`의 CHECK·FK·인덱스), 시드 `link-slots-plus-5`(보너스 5, 시작 `now()`, 끝 없음). 확인: `test/migrations.e2e-spec.ts` 0005(시드 행, CHECK, 사용자 삭제 CASCADE·이벤트 삭제 RESTRICT), `test/health.e2e-spec.ts` 테이블·적용 목록.
- [x] `GET /api/public/slot-event`(no-store), `POST /api/me/slot-event/entry`(201·200 멱등, 404·409), `GET·PUT /api/admin/slot-event`(쪽 나눔, 400 `validation_failed`·`slot_event_period_invalid`, 401·403·404), `CreatorLandingState.slotEvent`, `OperatorCreatorDetail.slotEvent`.
- [x] 한도: 보이는 링크 한도 = `min(5 + extra_link_slots + 보너스 합, 50)`. 확인(API 통합 테스트 `test/slot-event.e2e-spec.ts`): 신청 전 5·뒤 10, 같은 계정 동시 신청 10건 → 행 1개(201 하나), 시작 전·끝난 뒤 409 `slot_event_closed`, 끝난 뒤에도 신청 계정 한도 10, 추가 슬롯 2 → 12 · 0 → 10, 추가 슬롯 45 + 보너스 → 50, 6번째 링크 추가·숨김 해제가 보너스로 통과.
- [x] `apps/api/docs/README.md`와 `apps/api/CHANGELOGS.md` 갱신. `pnpm --filter @crelink/api lint`·`typecheck`·`test` 통과(lint는 아래 진행 기록 참고).

## 범위

- 포함: 위 수용 기준.
- 제외: 웹 화면(0122~0124), AI 운영자 Bearer 인증(에픽 0088).

## 위험·복구

새 테이블·시드 행만 더합니다. 운영 데이터가 생긴 뒤에는 되돌리지 않고 forward fix합니다(설계 `되돌리기`). 보너스는 회수하지 않습니다.

## 연결

- 설계: [링크 슬롯 +5 이벤트 기술 설계](../../specs/crelink-slot-event.md) `데이터 모델`·`API 계약 초안`·`구성과 흐름`
- 요구: [PRD](../../product/crelink.md) R24 ①②③⑤, R13

## 진행 기록

- 2026-10-10: 생성(0092 설계 분해).
- 2026-10-10 api: 구현. 새 `apps/api/src/slot-event/`(`SlotEventService`·컨트롤러 3개·`SlotEventModule`), migration `0005_slot_event.sql`, `CreatorService.limits`(보너스 합·50 상한)·`landingState.slotEvent`, `AdminService.detail.slotEvent`. 공유 계약(`packages/shared`)은 바꾸지 않았습니다(결함 없음).
  - 설계에 없던 세부와 근거: (1) 운영자 목록 `page`는 설계 표의 "아니면 1" 대신 운영자 크리에이터 목록과 같은 검사(없으면 1, 1 이상 정수가 아니면 400 `validation_failed`)로 정했습니다. 위임 지시("page 파싱은 `AdminService.list`와 같게")를 따랐고, 두 목록이 같은 규칙이 되도록 검사를 `src/common/input.ts` `pageNumber`로 옮겨 함께 씁니다. (2) 기간 시각 형식은 크리링 배너와 같은 시간대 필수 ISO 8601이며, `ad-banners.service.ts`의 검사를 `zonedTime`으로 옮겨 함께 씁니다(배너 오류 문구 그대로). `endsAt` 생략은 null과 같게(배너 등록과 같음). (3) 201·200은 Nest에 동적 상태 코드를 주는 기존 방식이 없어 `@Res({ passthrough: true })`로 정합니다(인증 컨트롤러와 같은 방식). (4) 409 문구: 시작 전 "아직 신청 기간이 아닙니다. 이벤트가 시작되면 신청해 주세요.", 끝남 "신청 기간이 끝난 이벤트입니다." (5) 검증 순서는 크리링 배너와 같이 형식(400) → 이벤트 없음(404). (6) migration 머리 주석의 lock_timeout 이유: 기존 테이블을 고치지 않지만 `users` FK 추가가 `users`에 잠금을 잡으므로 같은 규칙을 둡니다.
  - 실행한 검사(이 worktree, `make infra-up` 뒤): `pnpm --filter @crelink/api typecheck` 통과. `pnpm --filter @crelink/api test`(Node 24.20.0, 셸 기본 Node 22는 Jest가 `@nestjs/testing` ESM을 못 읽어 실행 불가) 24 스위트 190건 통과(새 `slot-event.e2e-spec.ts` 12건, migrations 0005 3건). `pnpm --filter @crelink/api lint`는 패키지에 `lint` 스크립트가 없어 "None of the selected packages has a lint script"로 아무것도 검사하지 않으므로, 루트 `pnpm lint`와 같은 도구로 `pnpm exec eslint apps/api packages/shared`·`pnpm exec prettier --check apps/api packages/shared`를 실행해 통과.
  - 실제 요청(`make up`, API 3320): `GET /api/public/slot-event` 200·`Cache-Control: no-store`·시드 열림, 비로그인 `POST …/entry`·`GET /api/admin/slot-event` 401. 개발 DB에 크리에이터·운영자 세션을 SQL로 만들어(확인 뒤 삭제) 신청 201 → 다시 200, `GET /api/me/landing` `visibleMax` 10·`slotEvent.entry`, 크리에이터의 운영자 경로 403, `?page=0` 400, 목록 200(`entryCount` 1·이메일·주소), 기간 끝 = 시작 400 `slot_event_period_invalid`, 시간대 없는 시각 400 `validation_failed`, 끝난 기간 저장 200(`ended`) 뒤 운영자 신청 409 `slot_event_closed`·신청 계정 200, 운영자 상세 `slotEvent`·`visibleMax` 10 확인. 기간은 시드 값(끝 없음)으로 되돌렸습니다.
  - 실행하지 못한 검사: `pnpm smoke`는 Playwright Chromium(`chromium_headless_shell-1248`)이 이 머신에 없어 시작 전에 실패했습니다. `pnpm verify`는 실행하지 않았습니다(웹 담당이 같은 브랜치에서 `slotEvent` 소비 코드를 고치는 중이라 웹 typecheck가 그 전까지 깨질 수 있음). `make up`의 pm2가 `.local/pm2/interactor.sock` 연결에서 `EINVAL`(worktree 경로가 길어 유닉스 소켓 경로 한도를 넘는 것으로 보임 [INFERENCE])을 내고 exit 2로 끝나지만 API·웹 프로세스는 떴습니다.
  - `pnpm work:scope 0121`: 이 티켓의 변경(`apps/api/**`, `docs/work/api/0121-slot-event-api.md`)은 모두 허용 경로 안입니다. 명령은 같은 통합 브랜치 작업 트리의 다른 역할 변경(`design/slot-event/**`, `docs/specs/crelink-slot-event.md`, `package.json`, `pnpm-lock.yaml`) 5개 때문에 exit 1입니다. `pnpm docs:check` 통과(Markdown 191개).
- 2026-10-10: 0125 통합에서 확인하고 `완료`로 바꿨습니다. Node 24.20 `pnpm verify` 통과(API 190/190), `pnpm e2e` 14/14(`slot-event.spec.ts` 2개 포함)·`pnpm smoke` 5/5 통과.
