# 0256 OAuth·Unified 연결·일일 토큰 점검

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

OAuth·Unified 연결·일일 토큰 점검

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] `... test -- instagram-connection` 통과. state 위조·타 세션·재사용 거부, 이중 연결 409, 편집자·AI 거부, 토큰이 DB 평문·응답에 없음, 만료 값 있음·없음, 무효 시 토큰 파기·취소, 충돌 시 기존 토큰 점검, 계정 복수 409; 모든 `reauth_required` 전이가 공통 함수 하나로 상태·토큰 NULL·`pending` 취소를 한 트랜잭션에서 처리, 외부 호출 중 `token_revision`이 바뀌면 결과 버림, 키 버전 불일치 재암호화

## 범위

- 포함: `instagram/connection*.ts`, `token-health*.ts`, `test/instagram-connection.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
