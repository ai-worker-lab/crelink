# 0263 OAuth 콜백 route(Facebook 로그인 기준)·BFF 규칙(공개 수신 거부 규칙 포함)

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

OAuth 콜백 route(Facebook 로그인 기준)·BFF 규칙(공개 수신 거부 규칙 포함)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] `pnpm --filter @crelink/web test` 통과. 소유자 경로만 허용, 쿠키 전달

## 범위

- 포함: `apps/web/src/app/me/integrations/instagram/callback/route.ts`, `lib/api/backend-rules.ts`, 해당 spec
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
