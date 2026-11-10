# 0256 OAuth·Unified 연결·일일 토큰 점검

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

OAuth·Unified 연결·일일 토큰 점검

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [x] `... test -- instagram-connection` 통과. state 위조·타 세션·재사용 거부, 이중 연결 409, 편집자·AI 거부, 토큰이 DB 평문·응답에 없음, 만료 값 있음·없음, 무효 시 토큰 파기·취소, 충돌 시 기존 토큰 점검, 계정 복수 409; 모든 `reauth_required` 전이가 공통 함수 하나로 상태·토큰 NULL·`pending` 취소를 한 트랜잭션에서 처리, 외부 호출 중 `token_revision`이 바뀌면 결과 버림, 키 버전 불일치 재암호화

## 범위

- 포함: `instagram/connection*.ts`, `token-health*.ts`, `test/instagram-connection.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현 완료. `apps/api/src/instagram/{connection.controller,connection.service,token-health.service}.ts`와 시험. 실제 Meta는 호출하지 않았고 Graph는 `jest.spyOn`으로 교체했습니다(실제 연동 미검증, 설계의 S7 `[M?]` 유지).
  - `pnpm --filter @crelink/api test -- instagram-connection`: 58 통과. `src/instagram/connection.service.spec.ts`: 13 통과. API 전체 `pnpm --filter @crelink/api test`: 39 스위트 442 통과.
  - `pnpm --filter @crelink/api typecheck`: exit 0. eslint: 오류 0(기존 web 경고 2). 변경 파일 prettier 통과.
  - `pnpm lint`는 exit 1입니다. 원인은 `packages/shared/src/instagram-dm.ts`의 prettier 경고 1건이고 기준 브랜치(`work/0251-instagram-comment-dm`)에 이미 있는 상태라 이 티켓 범위 밖입니다.
  - 변형 시험 6건(revision 조건 제거 2, 세션 대조 제거, state revision 제거, `pending` 취소 제거, 유효 토큰 409 제거): 각각 해당 시험이 실패함을 확인하고 원복했습니다.
  - 설계와 다른 점: state에 `rev`(시작 시점 `token_revision`, 연결 없으면 0)를 더해, 쿠키를 보관해 재전송한 성공 state도 표 없이 400으로 막습니다. 콜백도 `audience`를 재확인합니다(403 `instagram_unavailable`, 계약 초안에는 없음). 연결이 없을 때 `recheck`·`pause`는 409 `instagram_reauth_required`입니다.
  - 범위 밖이라 하지 않은 일: `apps/api/CHANGELOGS.md` 기록, `COOKIE_NAMES`에 `cl_ig_oauth_state` 추가(`packages/shared`). 쿠키 이름은 `connection.service.ts`의 `INSTAGRAM_OAUTH_STATE_COOKIE`에 있고 0263이 같은 값을 써야 합니다.
