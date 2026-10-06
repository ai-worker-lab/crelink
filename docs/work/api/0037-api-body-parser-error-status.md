# 0037 본문 파서 오류(본문 한도 초과·문자셋)가 500으로 응답되는 문제

- 단계: 티켓
- 역할: api
- 상태: 검증
- 종류: 결함
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-07

## 목적

API에 JSON 본문 한도(express 기본 100KB)를 넘는 요청이 오면 `413 Payload Too Large`가 아니라 `500 internal_error`로 응답하고 오류 로그를 남깁니다. 클라이언트 잘못을 서버 장애로 보고하게 되어 사용자에게 잘못된 안내("일시적인 오류")가 나가고, 운영 로그·알림에 가짜 장애가 섞입니다. 0036 무중단 검증의 느린 요청 시험(BFF에 180KB JSON)에서 발견했습니다.

원인: `ApiExceptionFilter`(`apps/api/src/common/http.ts`)는 Nest `HttpException`만 상태 코드를 살리고 나머지는 모두 500으로 바꿉니다. 본문 파서(body-parser)가 컨트롤러 전에 내는 오류는 `HttpException`이 아니라 `status`·`expose`가 붙은 http-errors 객체입니다(`entity.too.large` 413, `charset.unsupported` 415 등).

## 수용 기준

- [x] 본문 한도를 넘는 JSON 요청은 413 `{ code: 'validation_failed', message: '요청 본문이 너무 큽니다.' }`, 지원하지 않는 문자셋은 415 `validation_failed`로 응답하고 오류 로그를 남기지 않는다.
- [x] 클라이언트 오류(4xx이고 `expose`인 http-errors)만 그 상태를 쓰고, 그 밖의 예상하지 못한 오류는 지금처럼 500 `internal_error`와 로그다.
- [x] 한도 안의 본문, 잘못된 JSON(400), 기존 오류 응답은 바뀌지 않는다.
- [x] 회귀 시험(`apps/api/test/error-response.e2e-spec.ts`)이 수정 전에는 실패하고 수정 뒤 통과한다. `pnpm verify` 통과, 운영 배포 뒤 BFF 경유 큰 본문이 413인지 확인.

## 범위

- 포함: `apps/api/src/common/http.ts`(`ApiExceptionFilter`), 시험, `apps/api/docs/README.md` 오류 응답 설명, `apps/api/CHANGELOGS.md`.
- 제외: 본문 한도 값 변경(100KB 유지, 이미지 업로드는 multipart 경로와 별도 한도), 웹 BFF(상태 코드를 그대로 전달하므로 변경 없음).

## 위험·복구

해당 없음(오류 응답 상태 코드만 바뀜). 되돌리기는 이 커밋을 되돌려 배포.

## 연결

- 발견: [0036 진행 기록](../orchestrator/0036-zero-downtime-cutover-verify.md)
- 코드: `apps/api/src/common/http.ts`, `apps/api/test/error-response.e2e-spec.ts`
- 외부: [body-parser 오류](https://github.com/expressjs/body-parser#errors)

## 진행 기록

- 2026-10-07: 생성·착수(사용자 지시 "413 500 버그 처리"). 재현: 회귀 시험에서 110KB JSON 413 기대 → 500, 문자셋 오류 415 기대 → 500(수정 전 2개 실패, 잘못된 JSON 400·정상 본문 401은 통과). 수정: 필터가 `HttpException`이 아닌 오류 중 `status`가 4xx이고 `expose === true`인 것은 그 상태와 기존 `FALLBACK_CODES`(413 추가 문구 그대로, 415 새 문구)로 응답. 수정 뒤 4개 통과.
