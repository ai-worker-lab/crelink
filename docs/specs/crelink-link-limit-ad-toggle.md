# 외부 링크 50개 기본 제공과 광고 블록 켜고 끄기 기술 설계

- 상태: 승인
- 작성일: 2026-10-12
- 에픽: `docs/work/epics/0175-link-limit-ad-block-toggle.md`
- 입력: PRD R13·R20 ⑩·R24(철회)([docs/product/crelink.md](../product/crelink.md)), 기존 설계 [MVP](crelink-mvp.md)(R13 한도)·[광고 배너](crelink-ad-banner.md)(R20 광고 블록·`resolveBannerSlot`)·[AI 운영자](crelink-ai-operator.md)(운영자 행동 기록)·[링크 슬롯 이벤트](crelink-slot-event.md)(이 설계로 대체됨). 새 기술 조사·ADR 없음(새 의존성·새 패턴 없음).
- 승인 근거: 2026-10-12 사용자(제품 책임자) 결정 두 가지(아래 `핵심 결정` 1·2)를 그대로 옮긴 설계입니다. 제품 결정은 다시 열지 않습니다. 새 디자인 인계는 없고 화면은 가장 가까운 승인 화면(링크 숨기기 스위치, 광고 배너 화면 카드)을 따릅니다.

작성 절차와 분해 규칙은 [기술 설계와 티켓 분해](README.md)를 따릅니다.

## 핵심 결정

1. **유료 링크 한도 없음.** 모든 크리에이터가 처음부터 외부 링크를 `CRELINK_LIMITS.totalLinks`(50)개까지 둡니다. 숨긴·차단 링크도 셉니다. "보이는 링크 한도"(무료 5 + 추가 슬롯 + 이벤트 보너스)는 없어지고, 한도 오류는 409 `link_total_limit_reached` 하나입니다. 숨김 해제에는 한도 검사가 없습니다(전체 수가 바뀌지 않음).
2. **보이는 한도를 늘리려고만 있던 기능은 지금 제거합니다.** 운영자 추가 슬롯(`PUT /api/admin/creators/{id}/extra-slots`, 크리에이터 상세 폼)과 링크 슬롯 +5 이벤트(R24: 공개·신청·운영자 경로, `/admin/slot-event`, 홈 카드, 편집 화면 띠·신청 줄, 안내 문서)를 코드·경로·화면·계약·문서에서 모두 걷어 냅니다.
3. **데이터는 지우지 않습니다.** 데이터 파괴는 명시적 요청이 필요하고, 사용자에게 기존 부여 기록을 보존한다고 안내했습니다. `users.extra_link_slots`, `slot_events`, `slot_event_entries`는 그대로 두고 새 코드는 읽지 않습니다. 삭제 시점은 분류 대기 work item `docs/work/api/0179-drop-retired-link-slot-data.md`에서 사람이 정합니다. 운영자 행동 기록의 지난 `creator.extra_slots`·`slot_event.period_update` 행은 감사 기록이라 지우지 않으며, 화면은 그 이름을 계속 한국어로 보여 줍니다.
4. **광고 블록 스위치 두 개, 둘 다 기본 꺼짐.** 운영자 플랫폼 스위치(전역 1개)와 크리에이터 계정 스위치입니다. 공개 랜딩은 `플랫폼 켬 AND 크리에이터 켬 AND 배너 슬롯 미부여 AND 기존 R20 ⑥ 숨김 규칙 통과`일 때만 광고 블록을 그립니다. 아니면 광고 종류는 `slot: null`이고 광고 노출 수를 남기지 않습니다. 배너 슬롯이 부여된 계정(R21)은 스위치와 관계없이 그대로입니다.
5. **플랫폼이 꺼져 있으면 크리에이터에게 기능이 보이지 않습니다.** 편집 화면에 광고 블록 줄·패널·스위치가 없고, 크리에이터 스위치 변경은 409 `ad_block_unavailable`입니다. 플랫폼이 켜지면 광고 줄에 스위치(기본 꺼짐)가 보이고 미리보기가 그 선택을 따릅니다. 끌어 둔 위치(`landing_blocks.slot_position`)는 스위치와 관계없이 유지합니다(플랫폼이 꺼진 동안 링크 순서를 저장하면 `slotIndex`를 보내지 않아 상대 위치가 그대로).
6. **배포 직후 운영 랜딩의 광고는 사라집니다.** 두 기본값이 모두 false라서이며, 사용자가 의도한 결과입니다.
7. **광고 수익 배분은 정해지지 않았습니다.** 크리에이터에게 보이는 문구는 수익·배분 조건을 약속하지 않습니다. 약관·PRD는 "광고 노출은 선택이고 수익 배분 여부·조건은 아직 정해지지 않았다"고만 적습니다.

## 요구 대응

| 요구 | 화면·상태 | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R13 계정당 외부 링크 50개(숨김 포함), 유료 한도 없음 | 편집 화면 한도 배지 `n/50`·한도 안내, 홈·안내 문서·약관 문구 | `POST /api/me/links` 409 `link_total_limit_reached`, `LinkLimits { totalMax, totalUsed }` | `links` 수 | 0176, 0177 |
| R13 운영자 추가 슬롯 제거 | 크리에이터 상세 폼 제거 | `PUT /api/admin/creators/{id}/extra-slots` 제거 | `users.extra_link_slots` 보존·미사용 | 0176, 0177, 0179 |
| R24 철회(링크 슬롯 +5 이벤트 제거) | `/admin/slot-event`·메뉴 `이벤트`·홈 카드·편집 띠·신청 줄·안내 제거 | `/api/public/slot-event`·`/api/me/slot-event/entry`·`/api/admin/slot-event` 제거, 지표 `events` 제거 | `slot_events`·`slot_event_entries` 보존·미사용 | 0176, 0177, 0179 |
| R20 ⑩ 플랫폼 스위치(운영자, 기본 꺼짐, 기록) | `/admin/ad-banners` 카드 `광고 블록` 스위치 | `GET·PUT /api/admin/ad-block`, 행동 기록 `platform.ad_block` | `platform_settings.ad_block_enabled` | 0176, 0177 |
| R20 ⑩ 크리에이터 스위치(계정, 기본 꺼짐) | 편집 화면 광고 줄 스위치, 플랫폼 꺼짐이면 줄 없음 | `PUT /api/me/ad-block`(409 `ad_block_unavailable`), `CreatorLandingState.adBlock` | `users.ad_block_enabled` | 0176, 0177 |
| R20 ⑩ 공개 노출 조건 | `/p/{publicId}` 광고 블록 유무 | 공개 랜딩 `slot`(`resolveBannerSlot` `adBlockEnabled`·`ad_off`) | 광고 노출 수(`ad_banner_daily_stats`)는 보일 때만 | 0176, 0177 |
| R21 배너 슬롯 그대로 | 변경 없음 | 변경 없음 | 변경 없음 | 0178(회귀 확인) |
| R16 | 390·1280px 가로 넘침 없음 | — | — | 0177, 0178 |

## 구성과 흐름

```text
공개 랜딩 /p/{id} → GET /api/public/landings/{id}
  API: platform_settings.ad_block_enabled AND users.ad_block_enabled → resolveBannerSlot({ adBlockEnabled, ... })
       hidden('ad_off'·'no_content'·'no_banners') ≠ null → slot: null(광고 노출 기록 없음)
편집 화면 → GET /api/me/landing → adBlock { platformEnabled, enabled }
  platformEnabled = false → 광고 줄·패널 없음, 링크 순서 저장에 slotIndex 생략
  스위치 → BFF PUT /api/me/ad-block { enabled } → CreatorLandingState
운영자 /admin/ad-banners → GET /api/admin/ad-block → 스위치 → BFF PUT /api/admin/ad-block → operator_actions `platform.ad_block`
```

## 데이터 모델

migration `0007_ad_block_toggle.sql`(첫 줄 `SET LOCAL lock_timeout = '5s'`, expand만):

- 새 테이블 `platform_settings`: `id boolean PRIMARY KEY DEFAULT true CHECK (id)`(행 1개), `ad_block_enabled boolean NOT NULL DEFAULT false`, `updated_at timestamptz NOT NULL DEFAULT now()`, `updated_by uuid REFERENCES users ON DELETE SET NULL`. `ai_operator_settings`와 같은 1행 패턴이며 시드 행 하나를 넣습니다.
- `users.ad_block_enabled boolean NOT NULL DEFAULT false`(계정 단위, 배너 슬롯 부여 `users.banner_slot_granted_at`과 같은 단위).
- 남기는 것: `users.extra_link_slots`(0001), `slot_events`·`slot_event_entries`(0005). 읽지도 지우지도 않습니다(0179).
- 되돌리기(운영 데이터가 생기기 전, 운영 DB는 명시적 승인 뒤 손으로): `DROP TABLE platform_settings; ALTER TABLE users DROP COLUMN ad_block_enabled; DELETE FROM schema_migrations WHERE version = '0007_ad_block_toggle';`. 옛 색 API는 새 열을 모르고 기존처럼 동작합니다.

## API 계약

기준은 `packages/shared/src/crelink.ts`입니다.

| 메서드·경로 | 권한 | 요청 | 성공 응답 | 오류 |
| --- | --- | --- | --- | --- |
| `GET /api/admin/ad-block` | 운영자(사람·AI) | — | `AdBlockSettingView { enabled, updatedAt, updatedBy }` | 401, 403 `forbidden` |
| `PUT /api/admin/ad-block` | 운영자(사람·AI, 기존 운영자 쓰기 규칙) | `SetAdBlockRequest { enabled }` | `AdBlockSettingView` | 400 `validation_failed`, 401, 403, 409 `ai_operator_paused`·`agent_run_required`(AI) |
| `PUT /api/me/ad-block` | 크리에이터(세션 본인) | `SetAdBlockRequest { enabled }` | `CreatorLandingState` | 400 `validation_failed`, 401, 409 `ad_block_unavailable`(플랫폼 꺼짐) |
| `GET /api/me/landing` | 크리에이터 | — | `CreatorLandingState`(+ `adBlock`, `limits { totalMax, totalUsed }`) | 기존과 같음 |
| `POST /api/me/links` | 크리에이터 | 기존 | 기존 | 409 `link_total_limit_reached`(`link_limit_reached` 없음) |
| `GET /api/admin/creators/{id}` | 운영자 | — | `OperatorCreatorDetail`(+ `adBlockEnabled`, `extraLinkSlots`·`slotEvent` 없음) | 기존과 같음 |

제거: `PUT /api/admin/creators/{id}/extra-slots`, `GET /api/public/slot-event`, `POST /api/me/slot-event/entry`, `GET·PUT /api/admin/slot-event`, 오류 코드 `link_limit_reached`·`slot_event_*`, `AiOperatorMetrics.events`.

운영자 행동 기록: `platform.ad_block`, 대상 `platform_setting`·`ad_block`, 전후 `{ enabled }`. 값이 그대로여도 기록하고 `updated_at`·`updated_by`는 바꾸지 않습니다(`ai_operator.pause`와 같은 규칙). 크리에이터 스위치는 운영자 쓰기가 아니라 기록하지 않습니다.

## 화면 상태와 API 대응

| 화면 상태 | 조건(API 응답) | 웹 |
| --- | --- | --- |
| 편집: 플랫폼 꺼짐 | `adBlock.platformEnabled = false`, `slot.kind = 'ad'` | 광고 줄·패널·스위치 없음, 미리보기 광고 없음 |
| 편집: 플랫폼 켬·크리에이터 끔 | `platformEnabled`, `!enabled` | 광고 줄(끌기 가능)과 스위치 `광고 블록 표시` 꺼짐, 미리보기 광고 없음 |
| 편집: 둘 다 켬 | 둘 다 true | 스위치 켬, 미리보기에 광고(배너가 없으면 기존 점선 자리) |
| 편집: 스위치 저장 실패 | 409 `ad_block_unavailable`·네트워크 | API 문구 안내, 상태 다시 읽기 |
| 편집: 배너 슬롯 부여 | `slot.kind = 'creator'` | 기존 배너 슬롯 그대로(스위치 없음) |
| 편집: 링크 한도 | `totalUsed >= totalMax` | 추가 버튼 대신 한도 안내 |
| 운영자 광고 배너 | `GET /api/admin/ad-block` | 카드 `광고 블록` 스위치·상태·마지막 변경, 저장 중 비활성·실패 안내 |
| 운영자 크리에이터 상세 | `adBlockEnabled` | `광고 블록` 켬/꺼짐(크리에이터 설정) |

## 권한·보안·개인정보

새 개인정보 수집은 없습니다. 플랫폼 스위치는 운영자 쓰기라 행동 기록에 남고 AI 운영자는 기존 운영자 쓰기 규칙(실행 헤더·멈춤)을 따릅니다. 크리에이터 스위치는 세션 본인만 바꿉니다. 개인정보 처리방침은 링크 슬롯 이벤트 신청 기록을 새로 받지 않고, 이미 받은 기록은 삭제 결정(0179) 전까지 쓰지 않고 보관한다고 고지합니다.

## 비기능 요구

공개 랜딩 질의 수를 늘리지 않습니다(플랫폼 설정·크리에이터 스위치는 기존 질의에 붙이고, 광고 블록이 꺼지면 크리링 배너를 읽지 않아도 됨). 스위치는 `role="switch"`와 이름이 있는 컨트롤입니다.

## 위험과 스파이크

| 질문 | 막는 티켓 | 스파이크 티켓 | 끝낼 조건 |
| --- | --- | --- | --- |
| 없음 | — | — | — |

## 디자인 검토 의견

새 디자인 산출물은 없습니다. 스위치는 기존 링크 숨기기·AI 멈춤 스위치 모양, 운영자 카드는 광고 배너 화면 카드 모양을 씁니다. 새 토큰 없음.

## 티켓 분해

| 번호 | 단계 | 역할 | 선행 | 요구 | 수용 기준 요약(확인 방법) |
| --- | --- | --- | --- | --- | --- |
| 0176 | 티켓 | api | — | R13, R20 ⑩, R24 | 계약·migration 0007·경로·공개 판정·제거, API 통합 시험 |
| 0177 | 티켓 | web | 0176 | R13, R20 ⑩, R24 | 두 스위치 화면·제거·문구, 웹 단위 시험, 390·1280px |
| 0178 | 티켓 | orchestrator | 0176, 0177 | 전부 | 문서·E2E·`pnpm verify`·`pnpm smoke`·브라우저 시나리오 a~e, PR |
| 0179 | 티켓 | api | — | R13, R24 | 분류 대기: 남은 데이터 삭제 여부를 사람이 결정 |

공유 계약은 통합 담당(0178)이 같은 브랜치에서 먼저 확정했고 0176·0177이 그 계약으로 병렬 구현했습니다. 모두 브랜치 `work/0178-link-limit-ad-toggle` 한 곳, PR 하나입니다.

## 검증 계획

- API 통합 시험: 50개(숨김 포함)까지 추가·51번째 409, 보이는 링크 6개 이상 허용·숨김 해제 무제한, 스위치 경로 권한·검증·기록, 공개 랜딩 판정 4가지(플랫폼 끔 / 플랫폼 켬·크리에이터 끔 / 둘 다 켬 / 배너 슬롯 부여)와 꺼진 동안 노출 기록 없음, migration 0007.
- E2E(`tests/e2e`): 한도 시나리오를 50개 기준으로, 광고 블록 시나리오에 두 스위치, 링크 슬롯 이벤트 시나리오 제거.
- 로컬 브라우저(통합 0178): (a) 보이는 링크 6개 이상에서 50개까지 추가, 51번째 거절 (b) 플랫폼 꺼짐 → `/p/{id}` 광고 없음·편집 화면 광고 줄 없음 (c) 플랫폼 켬 + 크리에이터 끔 → 광고 없음 (d) 둘 다 켬 → 광고 보임 (e) 배너 슬롯 부여 크리에이터 그대로.
- `pnpm verify`, `pnpm smoke`.

## 미정

- 광고 수익 배분 여부·조건(사용자 결정 전, 이 에픽은 구현하지 않음).
- 남은 데이터 삭제 시점(0179).

## 검토 기록

- 2026-10-12 orchestrator: 사용자 결정이 범위·데이터·기본값을 모두 정했으므로 역할별 설계 검토 batch 대신 구현 티켓(0176 api, 0177 web)이 각 영역 검토를 겸합니다. 구현 중 계약 변경 요청이 있으면 `변경 기록`에 남깁니다.

## 변경 기록

- 2026-10-12: 작성·승인(사용자 결정 1·2).
