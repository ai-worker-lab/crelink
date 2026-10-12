# 0179 쓰지 않는 추가 슬롯·링크 슬롯 이벤트 데이터 삭제

- 단계: 티켓
- 역할: api
- 상태: 완료
- 종류: 유지보수
- 우선순위: P2
- 작성일: 2026-10-12

## 목적

0175에서 운영자 추가 슬롯과 링크 슬롯 이벤트를 제거했지만, 데이터 파괴 금지 정책과 사용자 안내(기존 부여 기록 보존)에 따라 DB는 그대로 두었습니다. 남은 컬럼·테이블을 언제 지울지 사람이 명시적으로 정해야 합니다.

## 수용 기준

- [x] 사용자가 삭제 여부와 시점을 명시적으로 결정합니다(결정 전에는 아무것도 지우지 않음). 2026-10-12 사용자 결정: "사용하지 않는 데이터를 db에서 지우자".
- [x] 삭제로 정하면 새 migration이 `users.extra_link_slots`, `slot_event_entries`, `slot_events`를 지우고, 지우기 전 행 수와 백업 위치를 진행 기록에 남깁니다.

## 범위

- 포함: `users.extra_link_slots`(0001), `slot_events`·`slot_event_entries`(0005).
- 제외: 운영자 행동 기록(`operator_actions`)의 지난 `creator.extra_slots`·`slot_event.period_update` 행(감사 기록이라 지우지 않음).

## 위험·복구

삭제는 되돌릴 수 없습니다(백업 복원만 가능). 운영 행은 적용 전에 백업했습니다(진행 기록). 0008 뒤에는 `0007_ad_block_toggle`보다 앞선 릴리스로 롤백하면 API가 지운 컬럼·테이블을 읽어 실패합니다. 복구가 필요하면 0001·0005의 정의로 다시 만들고 백업을 넣는 새 migration을 씁니다.

## 연결

- 에픽 [0175](../epics/0175-link-limit-ad-block-toggle.md), 설계 [기술 설계](../../specs/crelink-link-limit-ad-toggle.md) `데이터 모델`, 통합 [0180](../orchestrator/0180-retired-data-drop-and-entry-focus.md), migration `apps/api/migrations/0008_drop_retired_link_slot_data.sql`

## 진행 기록

- 2026-10-12: 생성(0175 통합 중 등록).
- 2026-10-12: 사용자 결정("사용하지 않는 데이터를 db에서 지우자")으로 착수. 통합 브랜치 `work/0180-retired-data-drop-and-entry-focus`(0180).
- 2026-10-12 11:37 KST: 운영 DB 백업(읽기 전용 조회, 운영자 sops age 키로 `DATABASE_URL` 복호화, `postgres:17-alpine` 컨테이너의 `psql`·`pg_dump`, TLS `verify-full`). 지우기 전 행 수: `users.extra_link_slots <> 0` 2행(전체 사용자 7행), `slot_events` 1행, `slot_event_entries` 1행. 백업 위치: 운영자 Mac `~/orca/workspaces/crelink/_backup/0179-20261012T113721/`(저장소 밖, 폴더 700·파일 600) — `slot_event_tables.sql`(두 테이블 데이터), `slot_event_schema.sql`(두 테이블 정의·인덱스), `users_extra_link_slots.csv`(0이 아닌 사용자 id·값).
- 2026-10-12: migration `0008_drop_retired_link_slot_data`(첫 줄 `lock_timeout` 5초, `DROP TABLE slot_event_entries`·`slot_events`, `ALTER TABLE users DROP COLUMN extra_link_slots`). 운영자 행동 기록은 그대로 둡니다. 시험: `test/migrations.e2e-spec.ts` 0008(컬럼·테이블 삭제, 사용자·행동 기록 유지, lock_timeout 범위), `test/health.e2e-spec.ts` 테이블·적용 목록. `/privacy` 수집 항목에서 이벤트 신청 기록을 빼고 보관 기간에 삭제 사실을 적었습니다.
- 2026-10-12: 검증(통합 0180 진행 기록과 같음). `pnpm verify` 통과, 로컬 기동에서 0008 적용 뒤 테이블·컬럼 없음, `pnpm smoke`·`pnpm e2e` 통과. `검증`으로 넘깁니다.
- 2026-10-12: 완료. PR [#134](https://github.com/ai-worker-lab/crelink/pull/134) 머지(`7cd5962`), Deploy [38197227467](https://github.com/ai-worker-lab/crelink/actions/runs/38197227467) success. 운영 DB에서 0008 적용과 테이블·컬럼 삭제를 읽기 전용으로 확인했습니다(근거 [0180](../orchestrator/0180-retired-data-drop-and-entry-focus.md) 진행 기록).
