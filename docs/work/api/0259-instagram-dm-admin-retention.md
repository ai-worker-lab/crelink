# 0259 긴급 정지 API·보존·파기

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 준비
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
