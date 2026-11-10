# 0258 발송 worker·재시도·레이트

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

발송 worker·재시도·레이트

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [x] `... test -- instagram-worker` 통과. worker 2개 동시 실행에 fake Graph 1회, 불명 응답 재시도 0, 613/2534040·80002 레이트 대기와 헤더 대기, 메시지 접근 상태 전이, 토큰 무효 재시도 0과 `reauth_required` 전이, lease 만료 `unknown`, 종료 대기; 빈 슬롯 수만큼만 선점(프로세스당 5건), 호출 직전 재확인(스위치·정지·규칙 활성·lease), `message_body`로만 발송, 토큰 무효 결과는 `token_revision`이 같을 때만 적용, Graph 오류 원문이 로그에 없음

## 범위

- 포함: `instagram/worker*.ts`, `test/instagram-worker.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. `apps/api/src/instagram/worker.service.ts`, `worker-outcome.ts`, `apps/api/test/instagram-worker.e2e-spec.ts`.
- 2026-11-11: 검증(`make infra-up` 후, 실제 Meta 호출 없음. Graph는 `sendPrivateReply` spy, 재인증 전이는 `markReauthRequired` spy).
  - `pnpm --filter @crelink/api test -- instagram-worker`: 55개 통과. `pnpm --filter @crelink/api test`: 38개 파일 426개 통과.
  - `pnpm --filter @crelink/api typecheck`: 통과.
  - `pnpm lint`: 실패. 이 티켓 밖의 기존 문제입니다. eslint는 `apps/api/src/instagram/connection.service.ts:10`의 미사용 인자 2건(0256 자리 표시), prettier는 `packages/shared/src/instagram-dm.ts` 1건입니다. 이 티켓 파일 3개는 eslint·prettier 통과입니다.
  - 안전장치를 하나씩 빼는 변이 확인: 연결 잠금, 호출 직전 재확인, lease 확인, `status='sending'` 조건, 빈 슬롯 계산, 종료 대기를 빼면 시험이 실패합니다. 발송 행 잠금을 빼면 잠긴 행을 기다리며 멈춥니다(45초 제한으로 중단).
  - 미확정: 메시지 접근 꺼짐·정책 제재 코드는 S8 실측 전이라 `SEND_ERROR_CODES`가 비어 있고, 지금은 일반 거절(`failed`)로 끝납니다. 전이는 시험용 가짜 번호로만 확인했습니다. 코드를 확정하면 `graph.ts` 허용 목록에도 더합니다.
  - 실제 Meta 연동은 검증하지 못했습니다. 지표 `crelink.instagram.dm`과 `apps/api/CHANGELOGS.md` 기록은 소유 경로 밖이라 하지 않았습니다.
