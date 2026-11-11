# 0259 긴급 정지 API·보존·파기

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

긴급 정지 API·보존·파기

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] `... test -- "instagram-admin|operator-audit"` 통과. off 시 대기 건 취소·claim 0, 운영자 정지는 크리에이터가 못 풂, 90일 초과 행 삭제, 수신 거부 기록은 90일 파기에서 빠짐, 일반 해제·재연결에서는 유지

## 범위

- 포함: `instagram/admin*.ts`, `retention/retention.service.ts`, `test/instagram-admin.e2e-spec.ts`, `test/operator-audit-coverage.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. `apps/api/src/instagram/admin.controller.ts`, `admin.service.ts`, `apps/api/src/retention/retention.service.ts`, `apps/api/test/instagram-admin.e2e-spec.ts`, `apps/api/test/operator-audit-coverage.e2e-spec.ts`.
- 2026-11-11: 검증(`make infra-up` 후, 실제 Meta 호출 없음. Graph 메서드는 전부 spy).
  - `pnpm --filter @crelink/api test -- "instagram-admin|operator-audit"`: 2개 파일 21개 통과. `pnpm --filter @crelink/api test`: 44개 파일 622개 통과.
  - `pnpm --filter @crelink/api typecheck`: 통과. `pnpm lint`: 통과(eslint 오류 0, 기존 경고 2건은 `apps/web`).
  - 확인한 동작: off에서 모든 `pending` 취소·선점 0·다시 켜도 미발송, operators 강등에서 비운영자 `pending`만 취소, 운영자 정지 시 그 계정 `pending` 취소, `PUT /api/me/instagram/pause` 409 `instagram_operator_paused`, 90일 초과 발송 행·확인 코드 삭제(89일은 유지), 수신 거부 기록은 400일 지나도 유지되고 재인증·일반 해제·재연결 뒤에도 유지되어 재연결 후 선점 제외, 비운영자 403, AI 운영자 쓰기 403.
  - 안전장치를 하나씩 빼는 변이 확인 10종: operators 필터, off 전체 취소, 설정 행 잠금과 취소 순서, 운영자 정지의 취소, `updated_at` 유지, 사람 제한 2건, 보존 일수, 수신 거부 제외, 발송 행 파기를 빼거나 바꾸면 시험이 실패합니다. 취소와 설정 변경의 순서만 바꾼 변이는 통과합니다(`FOR UPDATE`가 순서를 보장하므로 동작 차이가 없음).
  - 수용 기준 체크를 비워 둔 이유: 운영자 정지는 `/pause`로는 풀 수 없지만, 크리에이터가 `DELETE /api/me/instagram` 뒤 다시 연결하면 행이 새로 만들어져 `operator_paused_at`이 NULL이 됩니다(일회성 시험으로 재현). 수정은 소유 경로 밖(`connection.service.ts`, 필요하면 migration)이고, 해제는 즉시 파기 요건이라 막는 방식도 결정이 필요해 `orchestrator`에게 넘깁니다.
  - 남은 경합: 정지 시점에 `sending`이던 건이 연결 전 실패나 레이트 제한으로 `pending`으로 돌아오면 취소되지 않습니다. 정지 중에는 선점되지 않지만 24시간 안에 다시 켜면 발송됩니다(`worker.service.ts`, 소유 경로 밖). `off`를 다시 누르면 치워집니다.
  - 설계와의 차이: 404 전용 오류 코드가 공유 계약에 없어 `creator_not_found`를 썼습니다. 쓰기 2개는 멈춤 스위치 관례대로 `@ActorKinds('human')`이고(설계 승인 항목 A4·A6), `updated_at`·`updated_by`는 광고 블록 카드 값이라 바꾸지 않습니다.
  - `apps/api/CHANGELOGS.md`와 `apps/api/docs`의 보존 작업 안내는 소유 경로 밖이라 고치지 않았습니다. 실제 Meta 연동은 검증하지 못했습니다.
