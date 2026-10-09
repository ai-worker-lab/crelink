# 0122 관리 화면 링크 슬롯 이벤트 신청

- 단계: 티켓
- 역할: web
- 상위: 0089
- 선행: 0120
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

링크 슬롯 +5 이벤트 기술 설계의 티켓 분해 0122입니다. 크리에이터가 관리 화면에서 이벤트를 알고 신청하며, 늘어난 한도를 봅니다.

## 수용 기준

- [x] `페이지 편집` 이벤트 띠와 `외부 링크` 패널 신청 줄이 디자인 인계(`design/slot-event/handoff.md`)의 상태 전부(열림·미신청, 신청 중, 완료, 실패 409·404·네트워크, 신청함, 끝남·미신청)를 그립니다. 확인: 로컬에서 각 상태 화면, 0125 E2E.
- [x] 신청은 `POST /api/me/slot-event/entry` 뒤 `reload()`로 한도 배지가 보너스를 반영합니다(`보이는 링크 n/10`).
- [x] 한도가 찬 안내 문구가 미신청·열림이면 이벤트 안내를 더합니다. 확인: `limits.ts` 단위 테스트.
- [x] 390·1280px 가로 넘침 없음. `pnpm --filter @crelink/web lint`·`typecheck`·`test` 통과.

## 범위

- 포함: 위 수용 기준, `CreatorLandingState.slotEvent`를 쓰는 미리보기 fixture 갱신.
- 제외: 홈·안내 문서(0123), 운영자 화면(0124).

## 위험·복구

해당 없음(화면만).

## 연결

- 설계: [링크 슬롯 +5 이벤트 기술 설계](../../specs/crelink-slot-event.md) `화면 상태와 API 대응`
- 디자인: `design/slot-event/handoff.md`
- 요구: [PRD](../../product/crelink.md) R24 ①③⑥

## 진행 기록

- 2026-10-10: 생성(0092 설계 분해).
- 2026-10-10 web(구현): 띠·패널 신청 줄·한도 안내 구현. 상태 `검증`.
  - 바꾼 파일: 새 `apps/web/src/components/manage/SlotEventOffer.tsx`(`SlotEventBand`·`SlotEventPanelRow`, 공용 `.event-offer` 마크업), `ManagerContext.tsx`(`slotEventAction`·`slotEventResult`·`applySlotEvent`·`resetSlotEvent`), `PageEditor.tsx`(처음 패널 머리 아래·`구역 선택` 위 띠, 떠날 때 결과 지움), `ManagerShell.tsx`(좁은 화면 `BannerSlotNotice` 아래·미리보기 위 띠), `LinksSection.tsx`(배지 아래 이벤트 줄, 완료 문장을 패널 `ActionStatus`로), `limits.ts`·`limits.spec.ts`(`offeredSlotEvent`, `linkLimitNotice(limits, slotEvent)`, 테스트 4건), `ManagerPreview.tsx`(추가 자리 안내도 같은 함수), `lib/api/errors.ts`(새 오류 코드 3개 고정 문구), `lib/landing-preview.spec.ts`(fixture `slotEvent`), `styles.css` 끝 `링크 슬롯 이벤트 — 관리 화면 (0122)` 블록(인계 `slot-event.css` 2부 중 관리 화면 몫), `apps/web/CHANGELOGS.md`.
  - 계약·mock: mock 없음. 공유 계약 그대로(`CreatorLandingState.slotEvent`, `CRELINK_API_PATHS.meSlotEventEntry`), 로컬 인스턴스의 실제 API로 확인. BFF 허용 경로는 HomeAdminAgent(0123·0124)가 더한 것을 씀.
  - 판단(인계에 없던 세부): ① 결과 상태는 `ManagerContext`에 두고(설계 검토 의견 5) `PageEditor`가 언마운트될 때 `resetSlotEvent`로 지움(`resetSelection`과 같은 방식). ② 초점은 누른 쪽 구성 요소만 옮김(좁은 화면에서 띠와 시트 카드가 함께 있어, 시트에서 누르면 초점이 시트 밖으로 나가지 않게). ③ 409는 `errors.ts` 고정 문구, 신청 404는 인계 문구 `진행 중인 이벤트가 없어 신청하지 못했어요.`를 관리 화면이 직접 씀. `errors.ts`의 `slot_event_not_found` 일반 문구는 운영자 화면 불러오기 오류에도 쓰이므로 `이벤트를 찾을 수 없어요. 새로고침해 주세요.`(배너 `banner_not_found`와 같은 꼴). ④ 다시 읽기가 실패한 완료는 POST 응답(`CreatorSlotEventState`)으로 `slotEvent`만 바꿔 `신청함` 줄이 보이게 함. ⑤ 신청 중에 다시 읽은 상태가 먼저 와도 결과 줄이 나올 때까지 띠·카드를 유지(깜빡임 방지). ⑥ 패널 완료 문장(B3 `ActionStatus`)은 패널에서 신청했을 때만 패널 `ActionStatus`에 넣음(띠에서 신청하면 띠 자리 완료 줄). ⑦ 카드 안 `ActionStatus`는 `.manager-panel .action-status`의 아래 여백을 0으로(카드 gap만).
  - 실행한 검사: `pnpm --filter @crelink/web typecheck` 통과, `pnpm exec eslint apps/web/src/components/manage apps/web/src/lib` 통과(웹 패키지에 `lint` 스크립트가 없어 루트 eslint·prettier를 범위로 실행), `pnpm exec prettier --check`(바꾼 파일) 통과, `pnpm --filter @crelink/web test` 48건 통과(`limits.spec.ts` 6건 중 새 4건), `pnpm work:scope` 통과.
  - 실제 화면(로컬 인스턴스 web 5493·api 3320, Playwright Chromium, 개발 DB에 `tests/e2e/fixtures.ts` 방식 사용자·세션 행, 끝나고 지움): 1280px A1·A2(끝 없음 문구, `구역 선택` 위, primary·`aria-describedby`)·B7(배지 `5/5` 경고, 이벤트 안내 한도 문구, 카드 설명)·B2(`신청 중…` 비활성·`aria-busy`)·B3(`신청함` 줄 초점, 배지 `5/10`, `ActionStatus` 완료, `링크 추가` 다시 보임, DB 신청 행 1개)·A4(처음 패널 완료 줄, 띠 없음, `구역 선택` `보이는 링크 5/10`, 띠에서 신청 시 완료 줄 초점·`role="status"`)·메뉴를 다녀오면 결과 줄 사라짐·A7·B5(route 끊기로 네트워크 오류: 띠·카드 유지, 오류 줄, `다시 시도`로 초점)·A6·B4 404(route 응답, 오류 줄 초점·`role="alert"`)·A8·B6·B8(신청한 계정: 띠 없음, `10/10`, 지금 문구 숫자 10, `이벤트 보너스 +5 받음2026년 10월 10일 신청`). 390px A1(sticky 줄 아래·미리보기 위)·B1(시트 카드, `3/5`)·A3(시트에서 누르면 띠도 잠김)·B3(초점은 시트 안 `신청함` 줄, `3/10`)·A4(시트 닫으면 띠 자리 완료 줄, 띠에서 신청 시 완료 줄 초점)·B10(추가 슬롯 2 + 보너스 `4/12`). 실제 409: 이벤트 끝을 잠시 지금으로 저장해 B4(고정 문구 오류 줄 초점, `reload()` 뒤 한도 문구가 지금 문구)·A5(처음 패널 오류 줄, 띠 없음)·A8·B9(다른 미신청 계정: 띠·카드 없음, 지금 문구) 확인 뒤 시드 값(시작 `2026-10-09T15:41:12.569Z`, 끝 null)으로 되돌림. 끝이 있을 때(잠시 `2026-11-30T14:59Z`로 저장 뒤 되돌림) 띠 문구 `…계정마다 한 번, 2026. 11. 30. 오후 11:59까지 신청할 수 있어요.`와 `<time datetime>` 확인. 모든 화면 `scrollWidth = clientWidth`(1280/1280, 390/390), 앱 콘솔 오류 없음(테스트 링크의 외부 아이콘 DNS 실패와 일부러 낸 409·네트워크 오류 리소스 기록만 제외). 확인 스크립트·스크린숏은 `.local/`에 두었다가 지움.
  - 확인하지 못한 것: `pnpm verify`·`make up` 뒤 `pnpm smoke`는 같은 worktree에서 HomeAdminAgent가 편집 중이라 돌리지 않음(통합 0125 몫). 화면 낭독기 실제 읽기, 다시 읽기 실패 뒤 대체 완료 문구(코드 경로만, 화면 확인 없음).
- 2026-10-10: 0125 통합에서 확인하고 `완료`로 바꿨습니다. 실제 API로 `tests/e2e/slot-event.spec.ts`(띠·패널 신청·한도 `5/10`·재방문 띠 없음·끝난 뒤 띠 없음, 390px) 통과, `pnpm verify` 통과(웹 48/48).
