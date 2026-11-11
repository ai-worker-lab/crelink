# 0252 스파이크(S1~S11, S2 실패 경로 포함)

- 단계: 티켓
- 역할: orchestrator
- 상위: 0251
- 상태: 보류/종료
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

스파이크(S1~S11, S2 실패 경로 포함)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] S1~S11 실측·날짜, 토큰 패턴(`EAA|IGAA`) grep 0건, `pnpm docs:check` 통과

## 범위

- 포함: `docs/references/instagram-comment-dm.md`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

Meta 앱 생성·시크릿 사용·테스트 DM 승인 전이라 보류합니다. 재개 조건: 사용자 승인(A1~A3). 그동안 구현은 가짜 Graph API로 검증합니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
