# 0271 수신 거부 API(서명 토큰 `POST { token }`)

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

수신 거부 API(서명 토큰 `POST { token }`)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] `pnpm --filter @crelink/api test -- instagram-opt-out` 통과. 거부 뒤 해당 사람 `pending` 취소·재저장 0, GET으로 거부되지 않음; 서명 위조·변조 토큰은 400 `opt_out_invalid`, 같은 토큰 재요청은 204 멱등, 90일 뒤 토큰도 동작, 기록 저장과 `pending` 취소가 한 트랜잭션, 요청 한도 적용, 토큰·요청 본문이 로그·Sentry에 없음

## 범위

- 포함: `apps/api/src/instagram/opt-out*.ts`, `apps/api/test/instagram-opt-out.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
