# 0257 웹훅 수신·서명·데이터 삭제 콜백

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254, 0255
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

웹훅 수신·서명·데이터 삭제 콜백

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [x] `... test -- instagram-webhook` 통과. 위조 403, 1바이트 변조 403, 커밋 전 응답 없음(DB 실패 503), 같은 웹훅 동시 20회에 행 1개, 미매칭 저장 0, 원문·`from.id` 저장 0, `value.id`·`value.comment_id` 양쪽, 1000건 배치 1회 INSERT, 수신 거부 대상 미저장, 24시간 초과 미저장; 불량 항목은 건너뛰고 유효 항목만 한 INSERT, 규칙 `version`·`enabled`·`archived_at` 재검사, `commented_at` 대체(`entry.time` 없음), 해시가 `ig_user_id` 기준, 삭제 콜백 때 `ig_user_id` 수신 거부 기록 파기

## 범위

- 포함: `instagram/webhook*.ts`, `raw-body.ts`, `signed-request.ts`, `app.setup.ts`, `test/instagram-webhook.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. `POST /api/webhooks/instagram`(raw 미들웨어 6,000,000바이트, `X-Hub-Signature-256`), `GET` 구독 확인, `POST .../data-deletion`, `GET /api/public/instagram-deletions/:code`. 서명 키는 `META_APP_SECRET` 기준이고 실측 전이라 코드에 `[M?]`로 표시했습니다.
- 2026-11-11: 검증 근거. `make infra-up` 후 `pnpm --filter @crelink/api test -- instagram-webhook` 76개 통과, `pnpm --filter @crelink/api test` 39개 파일 463개 통과, `pnpm --filter @crelink/api typecheck` 통과, `pnpm work:scope 0257 --base work/0251-instagram-comment-dm` 통과. SQL 조건을 하나씩 뺀 변이 시험(`FOR SHARE`, `version`, 수신 거부, 24시간, 규칙 생성 시각, `ON CONFLICT`)에서 해당 시험이 실패하는 것을 확인했습니다.
- 2026-11-11: `pnpm lint`는 실패합니다. 원인은 이 티켓 변경 전부터 있던 두 곳입니다. eslint 오류 2건은 `apps/api/src/instagram/connection.service.ts:10`(0256 자리 함수의 미사용 인자), prettier 경고 1건은 `packages/shared/src/instagram-dm.ts`입니다. 이 파일을 뺀 eslint 오류는 0건입니다.
- 2026-11-11: 실제 Meta 웹훅은 호출하지 않았습니다. 서명 키(S1), `user_id` 대응(S9), 필드 형식(S5)은 미실측이고 스위치는 `off`입니다.
- 2026-11-11: 설계에 없어 정한 값. 삭제 확인 주소는 `{WEB}/privacy/instagram-deletion/{code}`이며 0267이 같은 주소로 화면을 만들어야 합니다. `audience=operators`이면 운영자 역할 계정의 댓글만 저장합니다.
- 2026-11-11: 소유 경로 밖이라 남긴 일. `apps/api/CHANGELOGS.md` 기록과 `monitoring/metrics.ts`·`apps/api/docs/README.md`의 지표 목록(`crelink.instagram.webhook`, `.body_bytes`)입니다.
