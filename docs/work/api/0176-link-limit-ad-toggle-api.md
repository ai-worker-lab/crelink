# 0176 링크 한도 단순화·광고 블록 스위치 계약과 API

- 단계: 티켓
- 역할: api
- 상위: 0175
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-12

## 목적

에픽 0175의 공유 계약과 API를 만듭니다. 보이는 링크 한도를 없애 전체 50개만 남기고, 운영자 추가 슬롯과 링크 슬롯 이벤트 코드를 걷어 내며, 광고 블록 플랫폼·크리에이터 스위치를 더합니다.

## 수용 기준

- [ ] `packages/shared`: `LinkLimits { totalMax, totalUsed }`, `link_limit_reached`·`freeVisibleLinks`·링크 슬롯 이벤트 절·추가 슬롯 계약 없음, `CreatorAdBlockState`·`SetAdBlockRequest`·`AdBlockSettingView`·`ad_block_unavailable`, `resolveBannerSlot`의 `adBlockEnabled`·`ad_off`. `pnpm --filter @crelink/shared test` 통과.
- [ ] migration `0007_ad_block_toggle`: `platform_settings`(1행, `ad_block_enabled` 기본 false)와 `users.ad_block_enabled`(기본 false). 지우는 문장 없음. migration 시험.
- [ ] 51번째 링크 추가는 409 `link_total_limit_reached`, 숨김 해제에는 한도 검사가 없음(API 통합 시험).
- [ ] `GET·PUT /api/admin/ad-block`(운영자, 행동 기록 `platform.ad_block`), `PUT /api/me/ad-block`(플랫폼 꺼짐이면 409 `ad_block_unavailable`), `CreatorLandingState.adBlock`, `OperatorCreatorDetail.adBlockEnabled`(API 통합 시험).
- [ ] 공개 랜딩: 광고 블록은 두 스위치가 모두 켜지고 배너 슬롯이 없을 때만, 아니면 `slot: null`이고 광고 노출을 남기지 않음. 배너 슬롯 부여 계정은 그대로(API 통합 시험).
- [ ] `src/slot-event/`, `PUT /api/admin/creators/{id}/extra-slots`, 지표 `events` 제거. `pnpm --filter @crelink/api test` 통과.

## 범위

- 포함: `packages/shared/**`, `apps/api/**`(코드·시험·`docs/README.md`·`CHANGELOGS.md`).
- 제외: 웹 화면(0177), E2E·PRD·설계 문서(0178), 남은 데이터 삭제(0179).

## 위험·복구

migration은 새 테이블·컬럼만 더합니다(expand). 옛 색 API는 새 열을 모르고 그대로 동작합니다. 남은 `extra_link_slots`·`slot_events`·`slot_event_entries`는 읽지도 지우지도 않습니다.

## 연결

- 설계: [기술 설계](../../specs/crelink-link-limit-ad-toggle.md) `데이터 모델`·`API 계약`, 요구 R13·R20 ⑩·R24(철회)

## 진행 기록

- 2026-10-12: 생성. 공유 계약은 통합 담당(0178)이 같은 브랜치에서 먼저 확정했고(설계 `API 계약`), 이 티켓이 그 계약으로 API를 구현합니다.
- 2026-10-12: 구현(api agent). migration `0007_ad_block_toggle`(새 테이블 `platform_settings` 1행·`users.ad_block_enabled`, 둘 다 기본 false, expand만), `GET·PUT /api/admin/ad-block`(행동 기록 `platform.ad_block`), `PUT /api/me/ad-block`(플랫폼 꺼짐 409 `ad_block_unavailable`), 공개 랜딩 판정(두 스위치·배너 슬롯·R20 ⑥, 꺼지면 `slot: null`·노출 기록 없음), 한도는 전체 50개만(`link_limit_reached` 제거). `src/slot-event/`·`PUT …/extra-slots`·지표 `events` 제거. 남은 `users.extra_link_slots`·`slot_events`·`slot_event_entries`는 읽지 않고 보관(0179).
- 2026-10-12: 검증(통합 0178, Node 24.20.0, 이 worktree 인스턴스 슬롯 1). `pnpm --filter @crelink/api test` 28 suites·222 tests 통과(실제 PostgreSQL), `pnpm verify` 전 단계 통과. `검증`으로 넘깁니다.
- 2026-10-12: 완료. PR [#132](https://github.com/ai-worker-lab/crelink/pull/132) squash 머지(`66694c3`), Deploy [38195002415](https://github.com/ai-worker-lab/crelink/actions/runs/38195002415) success(`운영 주소 검사` 포함).
