# 0263 OAuth 콜백 route(Facebook 로그인 기준)·BFF 규칙(공개 수신 거부 규칙 포함)

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

OAuth 콜백 route(Facebook 로그인 기준)·BFF 규칙(공개 수신 거부 규칙 포함)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [x] `pnpm --filter @crelink/web test` 통과. 소유자 경로만 허용, 쿠키 전달

## 범위

- 포함: `apps/web/src/app/me/integrations/instagram/callback/route.ts`, `lib/api/backend-rules.ts`, 해당 spec
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. 콜백 route와 시험(`apps/web/src/app/me/integrations/instagram/callback/route.ts`, `route.spec.ts`), BFF 허용 목록과 시험(`lib/api/backend-rules.ts`, `backend-rules.spec.ts`).
  - 콜백: `cl_session`·`cl_ig_oauth_state` 쿠키와 code·state를 `POST /api/me/instagram/callback`에 보내고 `/me/landings/{publicId}/instagram`으로 돌아갑니다. 실패는 `?instagram_error=<코드>`입니다. 연결은 세션 사용자 본인 페이지에 저장되므로 대상은 `GET /api/me/pages`의 `owner` 항목입니다. 대상을 알 수 없으면 구글 콜백처럼 성공은 `/me`, 실패는 `/notice`입니다. 사용자 거부는 API를 부르지 않고 `instagram_access_denied`로 돌아갑니다.
  - BFF: `/api/me/instagram*` 소유자 경로(메서드별)와 공개 `POST /api/public/instagram-dm-opt-outs`를 더했습니다. 설계의 권한이 `로그인·사람`이고 state 쿠키가 필요한 `callback`, 웹훅은 넣지 않았습니다. 규칙 ID는 `[a-z0-9]{10}`로만 받습니다.
  - 검증: `pnpm --filter @crelink/web test` 148건 통과(새 시험 16건), `pnpm --filter @crelink/web typecheck` 통과, `pnpm lint` 통과(기존 경고 2건, 오류 없음), `pnpm --filter @crelink/web build` 통과(`route.spec.ts`는 route로 등록되지 않음), `pnpm work:scope 0263 --base work/0251-instagram-comment-dm` 통과.
  - 실제 런타임: 저장소 밖 가짜 API와 `next start`로 확인(Meta 호출 없음). 콜백 성공·실패·거부의 302 주소, API로 간 쿠키가 두 개뿐인 것, BFF의 공개 수신 거부 같은 출처 204와 다른 출처 403, 웹훅·콜백·미등록 경로 404, 서버 로그에 code·state 없음을 봤습니다.
  - 시험 변이 8건(쿠키 누락 2, 코드 형식 검사 제거, 거부 처리 제거, 편집자 페이지 선택, 콜백·웹훅 허용, 규칙 ID 완화)을 넣어 모두 실패로 잡히는 것을 확인했습니다.
  - 지정 소유 경로 밖이라 하지 않은 것: `apps/web/CHANGELOGS.md` 기록, `state.ts`의 `instagram_access_denied` 문구(현재 화면은 이 코드를 무시해 안내 없이 돌아옴), 공유 계약의 `COOKIE_NAMES`(쿠키 이름을 route 상수로 둠). 브라우저 확인은 화면 변경이 없어 하지 않았습니다.
  - 0271 참고: BFF 일반 전달은 방문자 IP를 API로 넘기지 않으므로 수신 거부의 IP 요청 한도는 웹 서버 주소로 묶입니다. 구현 시 키 설계가 필요합니다.
