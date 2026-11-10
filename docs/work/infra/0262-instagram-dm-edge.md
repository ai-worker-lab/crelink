# 0262 공개 경로(2개만)

- 단계: 티켓
- 역할: infra
- 상위: 0251
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

공개 경로(2개만)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] `bash infra/prod/tests/caddy-routing.sh` 통과. 새 경로 2개의 GET·POST만 API로, 그 밖은 기존과 같음

## 범위

- 포함: `infra/prod/Caddyfile`, `infra/prod/tests/caddy-routing.sh`, `infra/prod/verify.sh`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
