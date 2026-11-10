# 0253 공유 계약

- 단계: 티켓
- 역할: api
- 상위: 0251
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

공유 계약: 새 상태, recheck, 수신 거부, 250자, 새 오류 코드

위험 등급 R1, 담당 Luna high.

## 수용 기준

- [ ] `pnpm --filter @crelink/shared test`, `pnpm typecheck` 통과

## 범위

- 포함: `packages/shared/src/instagram-dm.ts`, `index.ts`, `crelink.ts`(경로·오류·행동 타입만)
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
