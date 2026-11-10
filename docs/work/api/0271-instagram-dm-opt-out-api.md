# 0271 수신 거부 API(서명 토큰 `POST { token }`)

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

수신 거부 API(서명 토큰 `POST { token }`)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [x] `pnpm --filter @crelink/api test -- instagram-opt-out` 통과. 거부 뒤 해당 사람 `pending` 취소·재저장 0, GET으로 거부되지 않음; 서명 위조·변조 토큰은 400 `opt_out_invalid`, 같은 토큰 재요청은 204 멱등, 90일 뒤 토큰도 동작, 기록 저장과 `pending` 취소가 한 트랜잭션, 요청 한도 적용, 토큰·요청 본문이 로그·Sentry에 없음

## 범위

- 포함: `apps/api/src/instagram/opt-out*.ts`, `apps/api/test/instagram-opt-out.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. `POST /api/public/instagram-dm-opt-outs`(`{ token }`, 204, `Cache-Control: no-store`). `crypto.ts`로 검증한 뒤 `instagram_dm_opt_outs` INSERT(`ON CONFLICT DO NOTHING`)와 해당 사람의 `pending` 취소를 한 트랜잭션으로 처리합니다. 모든 형식 오류는 400 `opt_out_invalid`이고 이때 DB를 쓰지 않습니다. DB 오류는 SQLSTATE만 남기고 503 `database_unavailable`입니다.
- 2026-11-11: 요청 한도. `landing_event_limits`에 사람별 1분 10회, 방문자 IP별 1분 240회(`landing-events`의 IP 한도와 같은 값)입니다. `landing-events`는 요청의 IP를 쓰지 않고 서명으로 확인한 `visitorId`와 그에 연결된 `visits.ip`만 키로 씁니다. 수신 거부 토큰에는 연결된 방문 기록이 없어 서명으로 확인한 사람을 기본 키로 쓰고, IP는 신뢰 프록시가 넘긴 값(`TRUSTED_PROXY_HOPS`)이 있을 때만 씁니다. 소켓 주소로 돌아가지 않으므로 BFF를 거친 방문자가 웹 서버 주소 하나로 묶이지 않습니다.
- 2026-11-11: 소유 경로 밖이라 남긴 일. (1) 지금 BFF 일반 전달은 방문자 IP를 넘기지 않아 운영에서 IP 한도가 동작하지 않고 사람별 한도만 동작합니다. 켜려면 0263의 규칙에 전달 표시를 더하고 `apps/web/src/app/api/backend/[...path]/route.ts`에서 그 규칙일 때 받은 `X-Forwarded-For`(Caddy가 `{client_ip}` 하나로 덮어쓴 값)를 API 요청 헤더에 그대로 넣어야 합니다. API 쪽 변경은 없습니다. (2) `apps/api/CHANGELOGS.md` 기록. (3) 429 전용 오류 코드가 공유 계약에 없어 기존 `telemetry_rate_limited`를 썼습니다.
- 2026-11-11: 설계에 없어 정한 값. 사람별 한도 1분 10회, 토큰 입력 상한 512자, 설정 없음 503 `instagram_not_configured`, DB 실패 503 `database_unavailable`입니다. 운영자 스위치가 `off`여도 수신 거부는 동작합니다.
- 2026-11-11: 검증 근거. `make infra-up` 후 `pnpm --filter @crelink/api test -- instagram-opt-out` 45개 통과. 조건을 하나씩 바꾼 변이 시험 11종(트랜잭션 제거, `pending`·`ig_user_id`·`commenter_hash` 조건 제거, `ON CONFLICT` 제거, 사람별·IP 한도 제거, 위조 토큰의 한도 소비, XFF 첫 값 사용, DB 오류 원문 로그, 소켓 주소 대체 복원)에서 해당 시험이 실패하는 것을 확인했습니다. 실제 Meta 호출은 없습니다.
- 2026-11-11: 전체 시험. `pnpm --filter @crelink/api test`를 최종 코드로 두 번 돌려 한 번은 44개 파일 648개 통과, 한 번은 2개 실패했습니다. 실패는 `test/ad-banners.e2e-spec.ts:333`, `test/admin-banner-slot.e2e-spec.ts:323`의 `<= Date.now()` 단언이고(DB 시각이 호스트보다 약 80ms 앞섬) 이 티켓이 건드리지 않은 시험입니다. `pnpm --filter @crelink/api typecheck`, `pnpm lint`, `pnpm work:scope 0271 --base work/0251-instagram-comment-dm`, `pnpm work:check`, `pnpm docs:check` 통과.
