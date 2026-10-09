# 0092 링크 슬롯 +5 이벤트 디자인·기술 설계·티켓 분해와 통합

- 단계: 티켓
- 역할: orchestrator
- 상위: 0089
- 상태: 검증
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

에픽 0089의 디자인 시안(designer), 기술 설계(`docs/specs/crelink-slot-event.md`), 역할별 티켓 분해(번호 0120~0139), 구현 통합을 맡습니다.

## 수용 기준

- [x] 디자인 `design/slot-event/`와 기술 설계가 `승인`이고(사용자 위임에 따른 AI 승인, 근거 기록), 티켓이 분해되어 있습니다.
- [x] 통합 브랜치에서 `pnpm verify`·`pnpm smoke`·이벤트 E2E가 통과하고 PR이 열려 있습니다.

## 범위

- 포함: 에픽 0089 수용 기준 전부의 디자인·설계·구현·통합.
- 제외: main 머지(부모 세션이 함).

## 위험·복구

에픽 0089 `위험·복구`를 따릅니다.

## 연결

- 에픽: [0089](../epics/0089-slot-event.md)
- 절차: [기술 설계와 티켓 분해](../../specs/README.md), [OpenDesign 사용 기준](../../../design/docs/opendesign.md)

## 진행 기록

- 2026-10-10: 생성. migration 번호는 `0005_slot_event.sql`로 미리 정했습니다(0088은 `0004_ai_operator.sql`).
- 2026-10-10: 디자인. `designer`가 `design/slot-event/`(index·states·slot-event.css·handoff)를 만들었습니다. OpenDesign brief 카드는 사람 입력이 필요해 0086 선례대로 토큰 HTML로 작업했고, `pnpm design:check --require-lint` 통과·390·1280px 가로 넘침 없음을 기록했습니다. orchestrator 기술 검토 통과, 기술 검토 요청 7건의 결정은 설계 `디자인 검토 의견`에 있습니다. 승인: 사용자 위임(2026-10-10, 에픽 0088 진행 기록)에 따른 AI 승인(근거는 handoff `기술 검토`).
- 2026-10-10: 기술 설계 `docs/specs/crelink-slot-event.md` 작성·승인(사용자 위임(2026-10-10, 에픽 0088 진행 기록)에 따른 AI 승인, 근거는 설계 `검토 기록`). 주요 결정: 이벤트·신청 테이블(신청 행에 보너스 사본), 보이는 한도 = min(5 + 추가 슬롯 + 보너스 합, 50), 멱등 신청(PK + `ON CONFLICT DO NOTHING`, 201·200), 지금 이벤트는 migration 0005 시드로 배포 시각에 열림(끝 없음), 운영자 API는 기존 `OperatorGuard`(0088 Bearer는 머지 뒤 자동 적용). 0088과 나중 머지 쪽이 붙일 연결(행동 기록 `slot_event.period_update`, 지표 `slot_event_applications`)은 설계 `위험과 스파이크`에 적었습니다.
- 2026-10-10: 티켓 분해 0120(api 계약)·0121(api)·0122·0123·0124(web)·0125(통합). 0120은 orchestrator가 바로 반영했고, `api` 1명(0121)과 `web` 2명(0122 / 0123·0124)이 같은 통합 worktree에서 소유 경로를 나눠 병렬로 구현했습니다. 범위 밖 발견: 0126(서버 렌더 날짜 표기), 0127(pm2 소켓 경로).
- 2026-10-10: 통합 검증은 [0125](0125-slot-event-integration.md) 진행 기록에 있습니다(`pnpm verify` 통과, `pnpm e2e` 14/14, `pnpm smoke` 5/5).
