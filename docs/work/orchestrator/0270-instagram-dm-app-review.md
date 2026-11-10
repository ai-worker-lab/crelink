# 0270 **보류**(사업자 확보 후 재개)

- 단계: 티켓
- 역할: orchestrator
- 상위: 0251
- 선행: 0269
- 상태: 보류/종료
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

**보류**(사업자 확보 후 재개): BV, Review, Advanced, Live 자료

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] 사용 사례·영상·URL 목록 완성, `pnpm docs:check` 통과, 권한별 30일 이내 성공 호출 1건 이상 기록(`instagram_manage_comments`는 런타임에 안 쓰므로 `GET /<media>/comments` 1회 근거 필요), Data Use Checkup 일정

## 범위

- 포함: `docs/references/instagram-app-review.md`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

2026-11-11 사용자 결정으로 사업자 없이 개발까지만 진행합니다. 재개 조건: 사업자 확보와 사용자 승인(A5).

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
