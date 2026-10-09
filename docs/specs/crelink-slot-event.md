# 링크 슬롯 +5 이벤트 기술 설계

- 상태: 승인
- 작성일: 2026-10-10
- 에픽: `docs/work/epics/0089-slot-event.md`
- 입력: PRD R24 ①~⑦과 관련 R13([docs/product/crelink.md](../product/crelink.md), R24는 0090이 PRD에 옮김), 디자인 인계 `design/slot-event/handoff.md`, [디자인 시스템](../../design/system/DESIGN.md), 기존 설계 [MVP](crelink-mvp.md)(R13 한도·운영자 추가 슬롯)·[광고 배너](crelink-ad-banner.md)(운영자 게시 기간 입력)·[운영 배포](crelink-prod-deploy.md)(migration 규칙). 새 기술 조사·ADR 없음(새 의존성·새 패턴 없음).
- 설계 티켓: `docs/work/orchestrator/0092-slot-event-design.md`
- 승인 근거: 사용자 위임(2026-10-10, 에픽 0088 진행 기록)에 따라 디자인·설계 승인은 AI가 합니다. `[AI 결정]`은 이 설계가 고른 안이며 사용자에게 되묻지 않고 근거를 함께 적었습니다.

작성 절차와 분해 규칙은 [기술 설계와 티켓 분해](README.md)를 따릅니다.

## 핵심 결정

1. "슬롯"은 외부 링크 슬롯(R13)입니다. 배너 슬롯(R21)은 계정에 켜고 끄는 방식이라 "5개"와 맞지 않습니다(에픽 0089 진행 기록).
2. 이벤트는 테이블 `slot_events`의 행 하나, 신청은 `slot_event_entries`의 행 하나입니다. 신청 행이 신청 시점의 보너스 수(`bonus_links`)를 사본으로 가져, 나중에 이벤트 설정이 바뀌어도 받은 보너스는 그대로입니다. `[AI 결정]`
3. 보이는 링크 한도 = `min(5 + extra_link_slots + 신청 행 bonus_links 합, 50)`입니다. 운영자 추가 슬롯(`users.extra_link_slots`)과 다른 열·다른 테이블이라 수동 값을 바꿔도 보너스는 바뀌지 않습니다(R24 ②). 전체 상한 50(`CRELINK_LIMITS.totalLinks`)은 그대로이고, 보이는 한도도 50을 넘지 않게 자릅니다. 운영자 추가 슬롯 상한 45도 그대로입니다. `[AI 결정]`: 숨긴 링크 포함 50개를 넘을 수 없는데 `보이는 링크 3/55`처럼 보이면 혼란스럽습니다.
4. 지금 이벤트는 migration `0005_slot_event.sql`이 시드합니다. 시작 = migration을 실행한 트랜잭션 시각(`now()`), 끝 = 없음. main 머지 → CD 배포가 migration을 실행하므로 배포 시각에 바로 열립니다. 끝은 운영자 화면에서 정합니다. `[AI 결정]`: 운영자 화면에서 여는 안은 배포 뒤 사람이 한 번 더 손대야 하고, 그 사이 홈 안내가 비어 있습니다.
5. API가 다루는 이벤트는 코드 `link-slots-plus-5`인 행 하나입니다(`SLOT_EVENT_CODE`). 이벤트를 만들거나 지우는 API는 없고 기간만 고칩니다. 다른 이벤트·보상은 에픽 범위 밖입니다. 한도 계산은 신청 행 전체의 합이라 나중에 이벤트가 늘어도 그대로 맞습니다.
6. 동시 신청 중복은 `PRIMARY KEY (event_id, user_id)`와 `INSERT … ON CONFLICT DO NOTHING`으로 막습니다. 신청은 멱등입니다: 새로 신청하면 201, 이미 신청했으면 200으로 같은 모양을 돌려줍니다(두 번 누르기·동시 요청이 오류가 되지 않음). 기간 검사는 같은 `INSERT … SELECT … WHERE` 안에서 DB 시각으로 합니다.
7. 관리 화면은 이벤트 상태를 `CreatorLandingState.slotEvent`로 받습니다(요청 하나 더 없음). 신청 뒤 웹은 기존 `reload()`로 상태를 다시 읽어 한도 배지·안내를 갱신합니다.
8. 운영자 API는 기존 `OperatorGuard`(세션 `role = 'operator'`)를 씁니다. AI 운영자 Bearer 인증(에픽 0088, 별도 브랜치)이 `OperatorGuard`에 들어오면 같은 경로를 AI도 씁니다. 이 에픽은 Bearer 인증을 만들지 않습니다.
9. 기능 티켓은 통합 브랜치 `work/0092-slot-event-design` 한 곳에 모으고 PR 하나로 main에 올립니다(광고 배너 0085와 같은 방식). main 머지는 부모 세션이 합니다.

## 요구 대응

| 요구 | 화면·상태(디자인) | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R24 ① 신청자만 +5, 계정당 1회, 미신청 그대로 | 관리 화면 `페이지 편집` 이벤트 띠·`외부 링크` 패널 신청 줄(handoff 1·2) | `POST /api/me/slot-event/entry`(201·200), `CreatorLandingState.slotEvent`·`limits.visibleMax` | `slot_event_entries` PK `(event_id, user_id)` | 0120, 0121, 0122 |
| R24 ② 운영자 추가 슬롯과 따로 합산, 수동 값을 바꿔도 유지 | 운영자 크리에이터 상세 한도 분해 `무료 5 + 추가 슬롯 n + 이벤트 5` | `OperatorCreatorDetail.slotEvent`, `limits.visibleMax`, 기존 `PUT …/extra-slots` 그대로 | `users.extra_link_slots`와 `slot_event_entries.bonus_links`가 따로 | 0120, 0121, 0124 |
| R24 ③ 기간(시작 필수·끝 선택), 시작 전·끝난 뒤 신청 불가, 보너스 유지 | 운영자 기간 카드, 관리 화면 끝난 뒤 띠 없음, 신청 실패 안내 | `PUT /api/admin/slot-event`, 409 `slot_event_closed`, `SlotEventView.status` | `slot_events.starts_at`·`ends_at`, 회수 없음 | 0120, 0121, 0122, 0124 |
| R24 ④ 로그인 전 홈 안내 → 가입 뒤 신청 | 홈 이벤트 구역(로그인 전 `구글로 시작하기`, 로그인 후 `내 크리링에서 신청하기`) | `GET /api/public/slot-event` | — | 0120, 0121, 0123 |
| R24 ⑤ 운영자(사람·AI) 기간 설정, 신청자 목록·수 | `/admin/slot-event`, 운영자 메뉴 `이벤트` | `GET·PUT /api/admin/slot-event` | 신청 행 + `users`·`landings`·`short_slugs` 조인 | 0120, 0121, 0124 |
| R24 ⑥ 한도 배지·안내 문구 반영, 이용 안내 | 배지 `보이는 링크 n/10`, 한도 찬 안내, `/docs/guide` | `limits.visibleMax` | — | 0121, 0122, 0123 |
| R24 ⑦ 신청 기록 보관·고지 | `/privacy` 수집 항목·목적·보관 | — | `slot_event_entries`(계정 삭제 시 CASCADE) | 0123 |
| R13 | 기존 한도 동작 유지(보너스 0이면 지금과 같음) | 기존 409 `link_limit_reached` | — | 0121 |
| R16 | 390·1280px 가로 넘침 없음 | — | — | 0122~0125 |

## 구성과 흐름

홈(로그인 전·후 같은 흐름):

```text
웹 SSR / → serverApi GET /api/public/slot-event → { event }
  event?.status === 'open'이면 이벤트 구역을 그림. 실패(네트워크·5xx)면 구역만 빼고 홈은 그대로.
```

신청:

```text
관리 화면 → GET /api/me/landing → CreatorLandingState(+ slotEvent { event, entry }, limits.visibleMax에 보너스 포함)
`신청하기` → BFF POST /api/me/slot-event/entry
  API 트랜잭션:
    INSERT INTO slot_event_entries (event_id, user_id, bonus_links)
      SELECT id, $user, bonus_links FROM slot_events
      WHERE code = 'link-slots-plus-5' AND starts_at <= now() AND (ends_at IS NULL OR now() < ends_at)
    ON CONFLICT (event_id, user_id) DO NOTHING RETURNING applied_at
    → 행이 생기면 201
    → 안 생기면: 이미 신청 행이 있으면 200(기간과 관계없이), 이벤트 행이 없으면 404 `slot_event_not_found`, 아니면 409 `slot_event_closed`
  응답 CreatorSlotEventState → 웹 reload()로 한도 다시 읽기
```

한도:

```text
CreatorService.limits(db, userId)
  SELECT u.extra_link_slots,
         (SELECT coalesce(sum(bonus_links), 0) FROM slot_event_entries WHERE user_id = u.id)::int AS event_bonus,
         count(l.id) FILTER (보이는 링크), count(l.id)
  visibleMax = min(5 + extra + event_bonus, 50)
링크 추가·숨김 해제는 지금처럼 사용자 행 잠금 뒤 이 값으로 검사합니다. 신청은 한도를 늘리기만 하므로 잠금이 필요 없습니다.
```

운영자:

```text
/admin/slot-event(서버 렌더) → GET /api/admin/slot-event?page= → { event, entryCount, entries(최신순 20개), page, pageSize }
기간 저장 → PUT /api/admin/slot-event { startsAt, endsAt } → 같은 응답(1쪽) → router.refresh()
/admin/creators/{userId} → OperatorCreatorDetail.slotEvent(신청 행 또는 null)
```

## 데이터 모델

migration `apps/api/migrations/0005_slot_event.sql`(0004는 에픽 0088 `0004_ai_operator.sql`). 새 테이블과 시드 행만 더합니다(expand, [운영 설계 migration 규칙](crelink-prod-deploy.md#db-migration-운영-규칙)). 기존 테이블을 고치지 않으므로 잠금 대기가 없지만, 같은 규칙대로 첫 줄은 `SET LOCAL lock_timeout = '5s';`입니다. Blue/Green 겹침 구간의 옛 API는 새 테이블을 모르고 한도를 5 + 추가 슬롯으로 계산합니다. 겹침 구간에 신청한 크리에이터는 옛 색으로 간 요청에서 잠깐 보너스가 빠져 보일 수 있으나, 데이터는 남고 새 색으로 바뀌면 맞아집니다.

| 테이블 | 주요 컬럼 | 규칙 |
| --- | --- | --- |
| `slot_events` | `id uuid PK DEFAULT gen_random_uuid()`, `code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{1,40}$')`, `bonus_links integer NOT NULL CHECK (bonus_links BETWEEN 1 AND 45)`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NULL`, `created_at`, `updated_at`, `CHECK (ends_at IS NULL OR ends_at > starts_at)` | 이벤트 한 행. 열림 = `starts_at <= now() < ends_at`(끝 없음이면 계속, 광고 배너 게시 기간과 같은 규칙). 시드: `('link-slots-plus-5', 5, now(), NULL)`. |
| `slot_event_entries` | `event_id uuid NOT NULL → slot_events ON DELETE RESTRICT`, `user_id uuid NOT NULL → users ON DELETE CASCADE`, `bonus_links integer NOT NULL CHECK (bonus_links BETWEEN 1 AND 45)`, `applied_at timestamptz NOT NULL DEFAULT now()`, `PRIMARY KEY (event_id, user_id)` | 계정당 한 번(R24 ①). 회수 API 없음. 계정을 지우면 함께 지워짐(R24 ⑦). 인덱스 `(event_id, applied_at DESC)`(운영자 목록), `(user_id)`(한도 합). |

`ends_at > starts_at`(같은 시각 금지)은 "끝 = 시작"이면 한 번도 열리지 않는 이벤트라 입력 실수로 봅니다. 지금 끝내기는 운영자가 끝을 지금 시각으로 저장합니다(시작이 과거이므로 통과).

### 되돌리기

운영 데이터가 생기기 전에는 아래 순서로 지웁니다. main 머지는 곧 운영 migration이므로 운영 DB에서는 명시적 승인 뒤 손으로 하는 작업입니다. migration 머리 주석에도 같은 내용을 적습니다.

```sql
DROP TABLE slot_event_entries, slot_events;
DELETE FROM schema_migrations WHERE version = '0005_slot_event';
```

운영 데이터(신청 행)가 생긴 뒤에는 지우지 않습니다. 보너스를 회수하면 신청한 크리에이터의 링크가 한도를 넘어 숨김 처리 문제가 생기기 때문입니다(에픽 `위험·복구`). 기능만 끄려면 운영자 화면에서 끝을 지금으로 저장합니다(새 신청만 막힘).

## API 계약 초안

`packages/shared/src/crelink.ts` 새 절 `// ---------- 링크 슬롯 이벤트 (R24) ----------`에 확정합니다(0120). 오류 형식은 기존 `ApiError { code, message }`.

| 메서드·경로 | 권한 | 요청 | 성공 응답 | 오류(코드·상태) |
| --- | --- | --- | --- | --- |
| `GET /api/public/slot-event` | 누구나 | — | `PublicSlotEventResponse { event }`(없으면 `event: null`), `Cache-Control: no-store` | — |
| `GET /api/me/landing` | 로그인 | 기존 | `CreatorLandingState` + `slotEvent: CreatorSlotEventState`, `limits.visibleMax`에 보너스 포함 | 기존과 같음 |
| `POST /api/me/slot-event/entry` | 로그인 | 본문 없음 | 201 새로 신청·200 이미 신청, `CreatorSlotEventState` | 401, 404 `slot_event_not_found`, 409 `slot_event_closed`(시작 전·끝남, 문구로 구분) |
| `GET /api/admin/slot-event?page=` | 운영자 | `page` 1부터(없으면 1) | `OperatorSlotEventResponse`(마지막 쪽보다 크면 `entries: []`) | 400 `validation_failed`(`page`가 1 이상 정수가 아님), 401, 403 `forbidden`, 404 `slot_event_not_found` |
| `PUT /api/admin/slot-event` | 운영자 | `SetSlotEventPeriodRequest { startsAt, endsAt }` | `OperatorSlotEventResponse`(1쪽) | 400 `validation_failed`(시각 형식), 400 `slot_event_period_invalid`(끝 ≤ 시작), 401, 403, 404 `slot_event_not_found` |
| `GET /api/admin/creators/{userId}` | 운영자 | 기존 | `OperatorCreatorDetail` + `slotEvent: SlotEventEntryView \| null` | 기존과 같음 |

신청할 수 있는 계정: 로그인한 모든 계정(정지 계정은 세션이 끊겨 401). 운영자 계정도 시험을 위해 신청할 수 있고, 목표 지표(실사용자)에서는 0088 정의대로 뺍니다. `[AI 결정]`

### 공유 타입 초안

```ts
// ---------- 링크 슬롯 이벤트 (R24) ----------

/** 'scheduled' = 시작 전, 'open' = 신청 받는 중, 'ended' = 끝남. API가 DB 시각으로 정합니다. */
export type SlotEventStatus = 'scheduled' | 'open' | 'ended';

export interface SlotEventView {
  /** 신청하면 늘어나는 보이는 외부 링크 수. */
  bonusLinks: number;
  startsAt: string;
  /** null이면 운영자가 끝을 정할 때까지 계속. */
  endsAt: string | null;
  status: SlotEventStatus;
}

/** `GET /api/public/slot-event`. 이벤트가 없으면 event: null. */
export interface PublicSlotEventResponse {
  event: SlotEventView | null;
}

export interface SlotEventEntryView {
  appliedAt: string;
  /** 신청 때 받은 보너스(이벤트 설정이 바뀌어도 그대로). */
  bonusLinks: number;
}

/** `CreatorLandingState.slotEvent`, `POST /api/me/slot-event/entry` 응답(201 새로 신청, 200 이미 신청). */
export interface CreatorSlotEventState {
  event: SlotEventView | null;
  entry: SlotEventEntryView | null;
}

export interface OperatorSlotEventEntry {
  userId: string;
  email: string;
  displayName: string | null;
  slug: string;
  appliedAt: string;
}

/** `GET /api/admin/slot-event?page=`, `PUT /api/admin/slot-event` 응답. entries는 신청 최신순, page는 1부터. 이벤트가 없으면 404라 event는 늘 있음. */
export interface OperatorSlotEventResponse {
  event: SlotEventView;
  entryCount: number;
  entries: OperatorSlotEventEntry[];
  page: number;
  pageSize: number;
}

/** `PUT /api/admin/slot-event`. ISO 8601. endsAt null = 끝 없음. */
export interface SetSlotEventPeriodRequest {
  startsAt: string;
  endsAt: string | null;
}
```

기존 타입 변경: `CreatorLandingState.slotEvent: CreatorSlotEventState`, `OperatorCreatorDetail.slotEvent: SlotEventEntryView | null`, `LinkLimits.visibleMax` 주석(`min(freeVisibleLinks + extraLinkSlots + 이벤트 보너스, totalLinks)`), `CrelinkErrorCode`에 `slot_event_not_found`·`slot_event_closed`·`slot_event_period_invalid`, `CRELINK_API_PATHS`에 `publicSlotEvent`·`meSlotEventEntry`·`adminSlotEvent`. 운영자 목록 쪽 크기는 `CRELINK_LIMITS.operatorPageSize`(20)를 그대로 씁니다.

## 화면 상태와 API 대응

문구 원문과 배치는 `design/slot-event/handoff.md`가 기준입니다. 앱(Expo)은 이 에픽 범위 밖입니다(관리·운영자 화면이 웹에만 있음).

| 화면 상태 | 조건(API 응답) | 웹 |
| --- | --- | --- |
| 홈 안내 보임 | `event.status = 'open'` | 로그인 전 `구글로 시작하기`, 로그인 후 `내 크리링에서 신청하기`(→ `/me`) |
| 홈 안내 숨김 | `event = null`, `scheduled`, `ended`, 요청 실패 | 구역 없음(홈 나머지는 그대로) |
| 관리 띠·패널 신청 카드 | `slotEvent.event.status = 'open'` · `entry = null` | `신청하기` |
| 신청 중 | 요청 대기 | 버튼 비활성·진행 문구, 다른 편집은 기존 `pending` 규칙 |
| 신청 완료 | 201·200 | 완료 알림(새 한도), `reload()` 뒤 띠 사라짐, 배지 `n/10` |
| 신청 실패: 기간 끝·이벤트 없음 | 409 `slot_event_closed`·404 `slot_event_not_found` | 코드별 고정 문구(`errors.ts`) + `reload()`(띠가 사라짐), 다시 시도 없음 |
| 신청 실패: 네트워크·그 밖 | 네트워크·5xx | `errorMessage` 문구, 버튼 `다시 시도` |
| 신청함 | `entry ≠ null` | 패널 `이벤트 보너스 +5 받음 · 신청일`, 띠 없음(기간과 무관) |
| 끝남·미신청 | `status = 'ended'` · `entry = null` | 띠·카드 없음 |
| 한도 참 | `visibleUsed >= visibleMax` | 미신청·열림이면 이벤트 안내를 더한 문구, 아니면 지금 문구 |
| 운영자 이벤트 화면 | `GET /api/admin/slot-event` 성공 | 기간 카드(상태 배지)·신청 수·표·쪽 넘김 |
| 운영자 빈 목록 | `entryCount = 0` | 빈 상태 문구 |
| 운영자 이벤트 없음 | 404 `slot_event_not_found` | `AdminShell` 오류 + 안내 |
| 운영자 기간 저장 오류 | 400 | 폼 오류 문구 |
| 운영자 크리에이터 상세 | `slotEvent` | 한도 분해 `무료 5 + 추가 슬롯 n + 이벤트 5`, 신청일 |

## 권한·보안·개인정보

- 신청은 세션 본인만(`SessionGuard`, 사용자 id는 세션에서). 요청 본문으로 대상 계정을 바꿀 수 없습니다.
- 운영자 경로는 `OperatorGuard`(401·403). 신청자 목록은 이메일을 담으므로 운영자 화면에서만 봅니다.
- 새 개인정보: 신청 기록(계정·신청 시각). 계정을 쓰는 동안 보관하고 계정 삭제 시 함께 지웁니다. `/privacy` 크리에이터 수집 항목·이용 목적에 더합니다(R24 ⑦).
- 공개 경로는 이벤트 기간·보너스만 돌려주고 신청 수·신청자는 돌려주지 않습니다.

## 비기능 요구

- 성능: 공개 이벤트 질의는 행 1개, 한도 질의는 `slot_event_entries (user_id)` 인덱스 하위 질의 하나를 더합니다. 홈은 이미 요청마다 렌더(`force-dynamic`)합니다.
- 관측: 신청 실패 409·404는 기존 오류 응답 경로 그대로입니다. 새 지표 없음.
- 접근성: 띠·카드는 `section`+제목, 완료·오류 알림은 기존 `ActionStatus`(live region)를 씁니다. 신청 완료 뒤 띠가 사라지면 초점을 알림으로 옮깁니다(handoff).

## 위험과 스파이크

| 질문 | 막는 티켓 | 스파이크 티켓 | 끝낼 조건 |
| --- | --- | --- | --- |
| 이벤트가 전역 데이터라 E2E에서 기간을 바꾸면 다른 시나리오(홈·관리 화면)에 끼어듦 | 0125 | 없음(광고 배너 선례) | `slot-event.spec.ts`를 `ad-banner`처럼 따로 한 워커로 돌리고 끝에 기간을 되돌림 |
| 0004(0088)와 0005의 머지 순서 | 0121 | 없음 | runner는 적용 안 된 파일을 이름순으로 모두 적용하므로 순서와 무관. `health.e2e-spec`의 적용 목록 기대값만 나중 머지 쪽이 고침 |
| `packages/shared/src/crelink.ts`를 0088과 함께 고침 | 0120 | 없음 | 새 타입은 파일 끝 새 절에 모음. 기존 타입 변경은 필드 한 줄씩 |
| 에픽 0088(AI 운영자, 설계 `docs/specs/crelink-ai-operator.md`, 브랜치 `work/0091-ai-operator-design`)의 운영자 행동 기록·지표와 연결 | 없음(머지 뒤 연결) | 없음 | 두 브랜치 중 나중에 머지하는 쪽이 붙입니다: `PUT /api/admin/slot-event`에서 같은 트랜잭션으로 `OperatorAuditService.record`(action `slot_event.period_update`, targetType `slot_event`, before/after `{ startsAt, endsAt }`, actor `@OperatorActor()`), 지표 `AiOperatorMetrics.events`에 `{ key: 'slot_event_applications', label: '슬롯 이벤트 신청', value: count(slot_event_entries) }`. AI 토큰 가드(`X-Crelink-Agent-Run`)는 0088이 공통 가드로 적용하므로 새 경로에도 자동 적용 |

## 디자인 검토 의견

2026-10-10 orchestrator 기술 검토(`design/slot-event/` 1회차 시안, handoff `기술 검토 요청` 1~7). **기술 검토 통과.** 막는 문제는 없고, 화면이 쓰는 데이터는 모두 `CreatorLandingState.slotEvent`·`limits`, `PublicSlotEventResponse`, `OperatorSlotEventResponse`, `OperatorCreatorDetail.slotEvent`에서 얻습니다. 새 토큰·새 의존성 없음. 질문에 대한 결정(`[AI 결정]`):

1. 로그인 후 홈의 신청한 계정: **(b) 그대로 둡니다.** 홈은 `GET /api/public/slot-event`만 읽고 신청한 계정에도 C3 카드가 보입니다. 홈 렌더마다 관리 상태를 읽는 비용과 계약 추가에 비해, 신청한 계정이 `/me`에서 `신청함` 줄을 보는 결과가 해롭지 않습니다.
2. 신청 404: 시안대로 409와 같이 처리합니다(오류 줄 + `reload()`, 다시 시도 없음). 위 `화면 상태와 API 대응` 표를 고쳤습니다.
3. 409 문구: 웹 `errors.ts`의 코드별 고정 문구 하나(`이벤트 신청 기간이 아니어서 신청하지 못했어요.`)를 씁니다(지금 방식). API 문구는 API 직접 호출·로그용입니다.
4. 완료 알림의 새 한도: 응답에 한도를 넣지 않고 시안의 대체 문구로 충분합니다(계약 그대로).
5. 결과 줄 수명: 결과 상태를 `ManagerContext`에 두는 구현이 `BannerSlotNotice`의 `slotNotice`와 같은 구조라 맞습니다. 세부는 web 판단.
6. 없는 쪽: API는 `OFFSET`으로 읽어 마지막 쪽보다 큰 `page`에 `entries: []`, `entryCount > 0`을 돌려줍니다(`SlotEventService.operatorPage`). `page`가 1 이상 정수가 아니면 400 `validation_failed`(크리에이터 목록과 같음)이므로 웹은 잘못된 `?page=`를 1로 고쳐 부릅니다. D13 그대로.
7. 상태 배지 클래스: web 판단(모양은 광고 배너 `ad-status-*`와 같게).

참고: handoff가 남긴 `formatDateTime` 서버(Node ICU)·브라우저 표기 차이(`PM`·`오후`)는 이 에픽 전부터 있는 공통 문제라 분류 대기 work item 0126으로 등록했습니다.

디자인 승인: 사용자 위임(2026-10-10, 에픽 0088 진행 기록)에 따른 AI 승인. 근거: 요구 R24 ①~⑦이 모두 화면 상태에 대응되고(handoff 상태 표 A·B·C·D·E), 기존 토큰·구성 요소만 쓰며, 390·1280px 가로 넘침 없음과 `pnpm design:check --require-lint` 통과를 디자이너가 실행해 기록했습니다.

## 티켓 분해

| 번호 | 단계 | 역할 | 선행 | 요구 | 수용 기준 요약(확인 방법) |
| --- | --- | --- | --- | --- | --- |
| 0120 | 티켓 | api | — | R24 | 위 공유 타입·오류 코드·경로가 `packages/shared`에 있고 `pnpm --filter @crelink/shared build` 통과 |
| 0121 | 티켓 | api | 0120 | R24 ①②③⑤, R13 | migration 0005(시드·CHECK·FK), 신청·공개·운영자 API, 한도 합산. API 통합 테스트: 201·200·동시 10건 → 1행, 409 시작 전·끝남, 끝난 뒤 보너스 유지, 추가 슬롯 변경 뒤 보너스 유지, 50 상한, 운영자 목록·쪽·기간 400, 401·403, migration 시드 |
| 0122 | 티켓 | web | 0120 | R24 ①③⑥ | 관리 화면 띠·패널 신청 줄·한도 안내 문구(handoff 1·2의 상태 전부), 단위 테스트(문구 함수), 390·1280px |
| 0123 | 티켓 | web | 0120 | R24 ④⑥⑦ | 홈 이벤트 구역(열림만), `/docs/guide` 한도 설명, `/privacy` 항목, 390·1280px |
| 0124 | 티켓 | web | 0120 | R24 ②③⑤ | `/admin/slot-event`(기간 카드·신청 수·표·쪽·오류), 운영자 메뉴 `이벤트`, 크리에이터 상세 한도 분해·신청일, 390·1280px |
| 0125 | 티켓 | orchestrator | 0121, 0122, 0123, 0124 | R24 | 실제 API로 E2E `tests/e2e/slot-event.spec.ts` 통과, `pnpm verify`·`pnpm smoke` 통과, 문서·변경 기록, PR |

## 검증 계획

에픽 통합 수용 기준(0089)과 확인 방법:

1. **홈 안내(R24 ④)**: 로그인 전 `/`에 이벤트 구역과 `구글로 시작하기`, 1280·390px 가로 넘침 없음. 로그인 후 `/`에 `내 크리링에서 신청하기` → `/me`.
2. **신청·한도(R24 ①⑥)**: 보이는 링크 5개인 크리에이터의 `페이지 편집`에 띠, `외부 링크` 패널 배지 `보이는 링크 5/5`와 이벤트 안내가 든 한도 문구 → `신청하기` → 완료 알림, 배지 `5/10`, 띠 사라짐 → 6번째 링크 추가 성공. DB 신청 행 1개. 같은 계정으로 다시 POST하면 200, 행 1개.
3. **미신청 그대로(R24 ①)**: 다른 크리에이터는 `보이는 링크 0/5`.
4. **추가 슬롯과 따로(R24 ②)**: 운영자가 신청한 크리에이터 추가 슬롯을 2 → 배지 `n/12`, 0 → `n/10`. 운영자 상세 한도 분해 문구.
5. **운영자(R24 ⑤)**: `/admin/slot-event`에 신청 수 1 이상·그 크리에이터 행(상세 링크). 390px.
6. **기간 끝(R24 ③)**: 운영자가 끝을 지금으로 저장 → 상태 `끝남` → 미신청 크리에이터 관리 화면에 띠 없음, POST 409 `slot_event_closed`, 홈 구역 없음, 신청한 크리에이터 한도 `10` 그대로. 시험 끝에 기간을 되돌림.
7. **동시 신청**: API 통합 테스트에서 같은 계정 동시 POST 10건 → 행 1개, 응답은 201 하나와 200 나머지.

화면과 무관한 불변 조건만 `pnpm smoke`가 보므로 위 시나리오는 E2E(`tests/e2e/slot-event.spec.ts`, Playwright 프로젝트 `slot-event`, `main`·`ad-banner` 뒤 한 워커)와 API 통합 테스트(`apps/api/test/slot-event.e2e-spec.ts`)에 둡니다.

## 운영 적용 절차

1. PR을 main에 머지하면 CD가 API를 새 색으로 띄우며 migration `0005_slot_event`를 실행합니다. 이 순간이 이벤트 시작입니다(끝 없음).
2. 배포 뒤 확인(본 도메인 `links.shaul.kr`은 모든 요청이 웹으로 가고 웹·BFF에 `/api/public/slot-event`가 없으므로 API는 edge 안에서 봅니다, [운영 런북 6](../../infra/docs/prod-runbook.md#6-운영-확인)과 같은 방식):
   - `ssh home-server` 뒤 `c=$(cat /opt/crelink/state/active-color)`, `sudo docker exec crelink-edge-caddy-1 wget -q -O - http://api-$c:3000/api/public/slot-event`가 `"status":"open"`(`bonusLinks` 5, `endsAt` null)을 돌려줍니다.
   - 로그인 전 `https://links.shaul.kr/` 홈에 이벤트 구역(`외부 링크 +5 이벤트`, `구글로 시작하기`)이 보입니다.
3. 끝을 정하려면 운영자(사람 또는 AI)가 `/admin/slot-event`에서 끝 시각을 저장합니다(화면은 웹 BFF `PUT /api/backend/api/admin/slot-event`를 거쳐 API `PUT /api/admin/slot-event`를 부름). 바로 닫으려면 끝을 지금으로 저장합니다.
4. 시작을 늦추고 싶으면 배포 직후 운영자 화면에서 시작을 미래 시각으로 저장합니다(그 사이 신청한 행은 유지).

## 미정

없음. 사용자 위임에 따라 `[AI 결정]`으로 정했습니다.

## 검토 기록

- 2026-10-10 orchestrator: 초안 작성.
- 2026-10-10 api(0121 구현 담당): 계약대로 구현 가능, 공유 타입 변경 없음. 운영자 `page`는 크리에이터 목록과 같게 1 이상 정수가 아니면 400(표 `GET /api/admin/slot-event` 반영), 기간 시각은 크리링 배너와 같이 시간대가 붙은 ISO 8601만 받음, 201·200은 `@Res({ passthrough: true })`. 반영함.
- 2026-10-10 designer: 디자인 시안 `design/slot-event/`와 기술 검토 요청 7건. 위 `디자인 검토 의견`에 결정을 남김.
- 2026-10-10 orchestrator: 설계 승인. 사용자 위임(2026-10-10, 에픽 0088 진행 기록)에 따른 AI 승인. 근거: 요구 대응표의 R24 ①~⑦이 화면·API·데이터·티켓에 모두 나타나고, 새 의존성·새 패턴이 없으며(기존 `ApiError`, BFF, migration 규칙), 되돌림이 보너스를 회수하지 않는 방향으로 정해져 있습니다.

## 변경 기록

- 2026-10-10: 초안 → 승인(디자인 검토 의견 1~7 반영: 신청 404를 409와 같이 처리, 운영자 `page` 검사).
- 2026-10-10: 통합(0125). 계약·화면 계약 변화 없음. E2E는 이벤트 기간을 바꾸므로 Playwright 프로젝트 `slot-event`를 `ad-banner` 뒤에 둡니다(위험과 스파이크 첫 줄대로). 범위 밖 발견 2건을 분류 대기로 등록했습니다: `docs/work/web/0126-format-datetime-server-locale.md`, `docs/work/orchestrator/0127-pm2-socket-path-too-long.md`.
- 2026-10-10: PR #69 검토 반영. `운영 적용 절차` 2의 확인 주소를 고쳤습니다. 본 도메인 `https://links.shaul.kr/api/public/slot-event`는 웹으로 가서 404이므로, 운영 런북 6의 edge 내부 검사(`docker exec crelink-edge-caddy-1 wget … http://api-$c:3000/api/public/slot-event`)와 로그인 전 홈 이벤트 구역 확인으로 바꿨습니다.
