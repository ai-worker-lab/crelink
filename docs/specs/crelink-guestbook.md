# 랜딩 방명록 탭 기술 설계

- 상태: 승인
- 작성일: 2026-10-08
- 에픽: `docs/work/epics/0046-landing-guestbook.md`
- 입력: PRD R19(`docs/product/crelink.md`), MVP 설계(`docs/specs/crelink-mvp.md`). 디자인 인계 없음(사용자 결정: 디자이너 인계 없이 현재 디자인 시스템 [0020](../work/designer/0020-crelink-design-system.md)·[0040](../work/orchestrator/0040-apply-studio-light-design.md)으로 바로 구현). 새 기술 조사·ADR 없음.

작성 절차와 분해 규칙은 [기술 설계와 티켓 분해](README.md)를 따릅니다. `[임시값]`은 사용자가 정하지 않은 값으로, 써 본 뒤 바꿀 수 있습니다.

## 요구 대응

| 요구 | 화면·상태 | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R19 ①⑧ 탭·끄기 | 공개 랜딩·관리 화면 보기 모드의 `링크`·`방명록` 탭, 관리 화면 편집 모드의 방명록 스위치 | `PublicLandingView.guestbookEnabled`, `PATCH /api/me/landing { guestbookEnabled }` | `landings.guestbook_enabled` | 0047, 0048, 0049 |
| R19 ②③ 읽기·쓰기·로그인 복귀 | 방명록 탭 목록·작성 폼·로그인 안내 | `GET`·`POST /api/landings/{publicId}/guestbook`, 웹 `/auth/google?returnTo=` | `guestbook_entries` | 0047, 0048, 0049 |
| R19 ④⑤ 비밀글·숨김 | 비밀글·숨김 표시, 크리에이터 숨김·숨김 해제 | 목록 가시성 규칙, `PUT /api/guestbook/{entryId}/hidden` | `is_secret`, `hidden_at` | 0047, 0048, 0049 |
| R19 ⑥ 작성자 삭제 | 내 글 삭제 | `DELETE /api/guestbook/{entryId}` | 행 삭제 | 0047, 0048, 0049 |
| R19 ⑦ 작성자 표시 | 작성자 이름·사진(없으면 '크리링 회원'·기본 프로필) | `GuestbookEntryView.author` | `landings.display_name`·`avatar_file_id` 조인 | 0048, 0049 |
| R19 가입 방식 유지 | 로그인 뒤 랜딩 방명록 탭 복귀 | 변경 없음(`provision` 그대로) | — | 0049 |

## 구성과 흐름

- 공개 랜딩(`/p/{publicId}`) SSR은 지금처럼 랜딩 내용만 받습니다. 방명록 목록은 보는 사람마다 다르므로(비밀글·숨김·내 글) 브라우저가 BFF(`/api/backend/*`, `cl_session` 전달)로 따로 불러옵니다. 방명록 조회는 방문으로 세지 않습니다(R9 기록은 단축 주소에서만).
- 탭 선택은 주소의 해시 `#guestbook`입니다. 해시는 3xx 리디렉트를 지나도 브라우저가 유지하므로, 외부에서 `/p/{id}#guestbook`으로 들어와 단축 주소(R7)를 거쳐도 방명록 탭이 열립니다. SSR은 해시를 모르므로 첫 그림은 `링크` 탭이고 하이드레이션 뒤 바뀝니다. `PassCleanup`의 `history.replaceState`는 해시를 지우지 않아야 합니다.

```text
방명록 탭 열림 → GET /api/backend/api/landings/{publicId}/guestbook (쿠키 있으면 보는 사람 판정)
  API: 랜딩 조회(없음 404, 정지 410, 꺼짐 404 guestbook_disabled) → 가시성 규칙으로 20개 → { entries, nextCursor, viewer }
글 남기기 → POST 같은 경로 { body, secret } (BFF Origin 확인) → 201 GuestbookEntryView → 목록 맨 위에 넣음
```

로그인 복귀(R19 ②):

```text
방명록 탭 "로그인하고 남기기" → 웹 GET /auth/google?returnTo=/p/{publicId}%23guestbook
  웹: returnTo 검증 → cl_return_to 쿠키(httpOnly, SameSite=Lax, 10분) → 기존 로그인 시작
Google → /auth/google/callback → 로그인 성공 → cl_return_to가 유효하면 /auth/return(쿠키 유지), 아니면 쿠키 삭제 후 /me
/auth/return(웹 화면) → location.replace('/auth/return/go') → 쿠키 확인·삭제 → 유효하면 302 그 랜딩, 아니면 /me
```

- 콜백에서 랜딩으로 바로 302하면 리디렉트 체인이 구글에서 시작돼 `Sec-Fetch-Site: cross-site`가 되고, 랜딩은 외부 진입으로 보고 단축 주소로 보내 방문이 한 번 더 기록됩니다. 그래서 랜딩 복귀는 웹 문서(`/auth/return`) 안에서 시작하는 같은 출처 이동으로 합니다. 돌아갈 주소는 쿼리가 아니라 `cl_return_to` 쿠키로만 넘깁니다. 쿼리로 넘기면 `/auth/return?to=/p/…` 링크를 외부에 공유해 단축 주소(R7)를 건너뛸 수 있기 때문입니다.
- `returnTo` 허용 형식은 `/p/{publicId}`와 선택 해시 `#guestbook`뿐입니다(정규식 `^/p/[a-z0-9]{10}(#guestbook)?$`) `[임시값]`. 그 밖은 버리고 `/me`로 갑니다(열린 리디렉트 방지).
- 방명록을 쓰려고 처음 로그인한 사람도 지금처럼 크리에이터로 가입되어 빈 랜딩·단축 주소가 생깁니다(R19, 사용자 결정). `/me`가 아니라 원래 랜딩으로 돌아갈 뿐입니다.

## 데이터 모델

migration `apps/api/migrations/0002_guestbook.sql`. 새 컬럼(기본값 있음)과 새 테이블만 더하므로 Blue/Green 겹침 구간에 옛 API가 그대로 동작합니다(expand, [운영 설계 migration 규칙](crelink-prod-deploy.md#db-migration-운영-규칙)).

| 테이블 | 주요 컬럼 | 규칙 |
| --- | --- | --- |
| `landings` | `guestbook_enabled boolean NOT NULL DEFAULT true` 추가 | R19 ⑧. 끄면 탭·조회·작성이 막히고 글은 그대로 남습니다. |
| `guestbook_entries` | `id uuid PK`, `landing_id → landings ON DELETE CASCADE`, `author_user_id → users ON DELETE CASCADE`, `body text`(1~500자), `is_secret boolean NOT NULL DEFAULT false`, `hidden_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()` | 인덱스 `(landing_id, created_at DESC, id DESC)`. 삭제는 행 삭제. 수정 없음. |

가시성 규칙(보는 사람 `viewer`, 랜딩 소유자 `owner`, 글 작성자 `author`). 작성자가 정지된 글은 모두에게 빼고 `[임시값]`, 그 밖에는 하나라도 맞으면 보입니다.

| 보는 사람 | 공개글 | 비밀글 | 숨긴 글 |
| --- | --- | --- | --- |
| 비회원·다른 회원 | 보임 | 안 보임 | 안 보임 |
| 작성자 | 보임 | 보임 | 보임, `hidden=false`로 응답(숨김 사실을 알리지 않음) |
| 랜딩 크리에이터 | 보임 | 보임 | 보임, `hidden=true` |

- 안 보이는 글은 목록·개수·커서 어디에도 나타나지 않습니다. 운영자도 같은 규칙이며(운영자 권한으로 비밀글을 여는 길 없음), 운영자 방명록 화면은 범위 밖입니다.
- 크리에이터가 자기 방명록에 쓴 글은 작성자이자 소유자로 봅니다.
- 되돌리기: 운영 데이터가 생기기 전에는 테이블·컬럼을 지웁니다. 생긴 뒤에는 다음 migration으로 고칩니다.

## API 계약 초안

`packages/shared/src/crelink.ts`에 확정합니다(0047). 오류 형식은 기존 `ApiError { code, message }`.

| 메서드·경로 | 권한 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- | --- |
| `GET /api/landings/{publicId}/guestbook?cursor=` | 누구나(세션 있으면 보는 사람 판정) | `cursor` 선택 | `GuestbookPage { entries, nextCursor, viewer: { signedIn, isOwner } }`, 최신순 20개 `[임시값]` | 404 `landing_not_found`·`guestbook_disabled`, 410 `creator_suspended`, 400 `validation_failed`(잘못된 커서) |
| `POST /api/landings/{publicId}/guestbook` | 로그인 | `{ body, secret? }` | 201 `GuestbookEntryView` | 401 `unauthenticated`, 400 `validation_failed`, 404 `landing_not_found`·`guestbook_disabled`, 410 `creator_suspended` |
| `DELETE /api/guestbook/{entryId}` | 작성자 | — | 204 | 401, 404 `guestbook_entry_not_found`(없거나 내 글 아님) |
| `PUT /api/guestbook/{entryId}/hidden` | 랜딩 크리에이터 | `{ hidden }` | `GuestbookEntryView` | 401, 404 `guestbook_entry_not_found`(없거나 내 랜딩 글 아님), 400 |
| `PATCH /api/me/landing` | 크리에이터 | 기존 필드 + `guestbookEnabled?: boolean` | `CreatorLandingState`(`landing.guestbookEnabled` 추가) | 기존과 같음 |
| `GET /api/public/landings/{publicId}` | 누구나 | 기존 | `PublicLandingView.guestbookEnabled` 추가 | 기존과 같음 |

- `GuestbookEntryView { id, body, secret, hidden, mine, author: { displayName, avatarUrl }, createdAt }`. `hidden`은 보는 사람이 랜딩 크리에이터일 때만 true가 될 수 있습니다. `mine`은 보는 사람이 작성자일 때 true이고 삭제 버튼을 보여 줄 근거입니다. 숨김 버튼은 `viewer.isOwner`가 근거입니다.
- 권한 없는 글에 대한 삭제·숨김은 403이 아니라 404로 답해 글의 존재(특히 비밀글)를 드러내지 않습니다.
- 본문: 앞뒤 공백을 잘라 1~500자 `[임시값]`, 줄바꿈 허용, 평문(웹은 텍스트로만 그림). `secret` 생략은 false.
- 커서: 마지막 항목의 `(created_at, id)`를 담은 불투명 문자열. 해석할 수 없으면 400 `validation_failed`.
- 응답은 `Cache-Control: no-store`(보는 사람마다 다름).
- 작성자 이름·사진은 작성자 랜딩(MVP는 사용자당 1개)의 현재 `display_name`·`avatar_file_id`로 매번 만듭니다. 이름을 바꾸면 이전 글에도 반영됩니다.
- 새 오류 코드: `guestbook_disabled`, `guestbook_entry_not_found`. 웹 BFF 허용 경로에 위 네 경로를 더합니다.

## 화면 상태와 API 대응

| 화면 상태 | 조건(API 응답) | 웹 |
| --- | --- | --- |
| 탭 | `guestbookEnabled` | true면 `링크`·`방명록` 탭(키보드로 옮길 수 있는 탭 목록), false면 탭 없이 지금 화면 그대로 |
| 로딩 | 목록 요청 중 | 방명록 탭 안 로딩 표시 |
| 빈 상태 | `entries` 0개 | "첫 방명록을 남겨 주세요" 류 안내 + 작성 자리 |
| 비회원 | `viewer.signedIn=false` | 작성 폼 대신 "로그인하고 남기기"(`/auth/google?returnTo=…%23guestbook`) |
| 회원 | `signedIn=true` | 본문 입력(글자 수/500), `비밀글` 체크, `남기기` |
| 내 글 | `mine` | 삭제(확인 후), 비밀글 표시 |
| 크리에이터 | `viewer.isOwner` | 글마다 숨기기·숨김 해제, 숨긴 글은 흐리게 + "숨김" 표시, 비밀글 표시 |
| 더 보기 | `nextCursor` 있음 | `더 보기` 버튼으로 이어 붙임 |
| 오류 | 400·401·404 `guestbook_disabled`·네트워크 | 입력 오류 안내, 401은 로그인 안내로, `guestbook_disabled`는 "방명록을 닫은 페이지예요", 그 밖은 다시 시도 |
| 관리 화면 편집 모드 | `CreatorLandingState.landing.guestbookEnabled` | 랜딩 미리보기 아래 방명록 켜기/끄기 스위치(즉시 저장) |
| 관리 화면 보기 모드 | 공개 랜딩과 같음 | 탭 포함(R18 ⑤) |

## 권한·보안·개인정보

- 쓰기·삭제·숨김·끄기는 BFF의 같은 출처(`Origin`) 확인을 거칩니다. 숨김은 랜딩 소유자만, 삭제는 작성자만 합니다.
- 비밀글 본문은 허용된 보는 사람 응답에만 들어갑니다. API 통합 테스트로 비회원·다른 회원 응답에 비밀글·숨긴 글이 없음을 확인합니다.
- 본문은 평문 저장이고 웹은 텍스트로만 그립니다(HTML 해석 없음).
- `cl_return_to`는 허용 형식만 저장·사용합니다.
- 개인정보 처리방침(`/privacy`)에 방명록 항목(작성 내용·비밀글 여부·작성 시각·작성 회원, 공개 범위, 작성자가 지울 때까지 보관)을 더합니다. Sentry에는 본문을 보내지 않습니다(기존 규칙: 요청 본문 제외).

## 비기능 요구

- 목록 조회는 인덱스 한 번 + 작성자 랜딩 조인으로 끝납니다. 페이지 20개 `[임시값]`.
- 390px·1280px 가로 넘침 없음(R16). 긴 단어·긴 본문은 줄바꿈(`overflow-wrap: anywhere`).
- 접근성: 탭은 `role="tablist"`/`tab`/`tabpanel`, 입력 레이블, 오류는 `role="alert"`.

## 위험과 스파이크

| 질문 | 막는 티켓 | 스파이크 | 끝낼 조건 |
| --- | --- | --- | --- |
| 콜백 뒤 같은 출처 이동이 실제로 `Sec-Fetch-Site: same-origin`으로 랜딩을 그리는가 | 0049 | 0049 안에서 확인 | 로컬에서 로그인 복귀 후 단축 주소 리디렉트가 없고 방문 행이 늘지 않음 |

- 작성 빈도 제한·신고가 없어 도배에 약합니다(PRD 위험). 필요해지면 별도 work item.

## 디자인 검토 의견

디자인 인계 없음. 웹은 현재 디자인 토큰·컴포넌트(`profile` 카드, 버튼, `empty-state`)로 그립니다. 디자이너 검토가 필요해지면 별도 work item.

## 티켓 분해

| 번호 | 단계 | 역할 | 선행 | 요구 | 수용 기준 요약(확인 방법) |
| --- | --- | --- | --- | --- | --- |
| 0047 | 티켓 | api | — | R19 | 계약 DTO·경로·오류 코드가 `packages/shared`에 있고 `pnpm typecheck` 통과 |
| 0048 | 티켓 | api | 0047 | R19 | migration·네 경로·`guestbookEnabled`, 가시성 규칙·권한·검증을 API 통합 테스트로 확인 |
| 0049 | 티켓 | web | 0047 | R19 | 탭·목록·작성·삭제·숨김·끄기·로그인 복귀·`/privacy`, 390px·1280px 확인 |
| 0050 | 티켓 | orchestrator | 0048, 0049 | R19 | 실제 API로 E2E 방명록 시나리오 통과, 문서·변경 기록·릴리스 노트 |

## 검증 계획

E2E(`tests/e2e/guestbook.spec.ts`, 0050). 기존 fixture로 크리에이터 A와 회원 B·C 세션을 만듭니다.

1. 비회원이 A 랜딩 방명록 탭을 열면 빈 상태와 로그인 안내가 보이고, 링크는 `/auth/google?returnTo=/p/{A}%23guestbook`이다.
2. B가 공개글·비밀글을 남기면 B 목록 맨 위에 둘 다 보인다.
3. 비회원·C에게는 공개글만 보이고 비밀글은 화면·API 응답 어디에도 없다.
4. A에게는 둘 다 보이고, A가 공개글을 숨기면 비회원·C에게서 사라지고 B에게는 숨김 표시 없이 그대로, A에게는 숨김 표시로 보인다. 숨김을 풀면 다시 보인다.
5. B가 자기 글을 지우면 모두에게서 사라진다. C에게는 삭제·숨김 버튼이 없다.
6. A가 관리 화면에서 방명록을 끄면 공개 랜딩에 탭이 없고, 다시 켜면 남은 글이 보인다.
7. 외부에서 `/p/{A}#guestbook`으로 들어오면 단축 주소를 거쳐 방명록 탭이 열린다.
8. 390px에서 긴 본문 글이 가로로 넘치지 않는다.

로그인 복귀는 실제 구글 로그인이 필요하므로 로컬에서 수동으로 한 번 확인합니다(키가 있는 경우). API 통합 테스트(0048)는 가시성 표의 칸마다 응답을 확인합니다.

## 미정

없음. `[임시값]`(본문 500자, 페이지 20개, `returnTo` 허용 형식, 정지 작성자 글 숨김)은 써 본 뒤 사용자가 바꿀 수 있습니다.

## 검토 기록

- 2026-10-08: 사용자가 R19 결정(가입 방식 유지, 작성자 랜딩 이름·사진, 크리에이터 숨김, 끄기 기본 켬)과 진행 방식(PRD R19 → 기술 설계·티켓 → api·web 구현 → 통합 검증, 디자이너 인계 생략)을 정해 진행을 승인. MVP 설계와 같이 역할별 설계 검토는 생략하고, 구현 티켓 담당이 설계와 다른 결정이 필요하면 진행 기록과 이 문서 `변경 기록`에 남깁니다.

## 변경 기록

- 2026-10-08: 작성·승인.
- 2026-10-08: 구현 결과 반영. 로그인 복귀를 `/auth/return` → `/auth/return/go`(쿠키 확인·삭제 후 302)로 확정하고, 돌아갈 주소를 쿼리로 넘기던 첫 구현은 R7 우회 때문에 쿠키 전용으로 바꿈. 편집 모드 방명록 스위치는 링크 편집을 아래로 밀지 않도록 미리보기 아래에 둠(0049·0050).
