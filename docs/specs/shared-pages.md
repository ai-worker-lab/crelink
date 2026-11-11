# 공유관리 페이지 기술 설계

- 상태: 승인
- 작성일: 2026-11-10
- 에픽: [0241](../work/epics/0241-shared-pages.md)
- 입력: [PRD R29, R19](../product/crelink.md), [웹 컴포넌트 카탈로그](../../design/docs/component-catalog.md)
- 승인 근거: 사용자 발언 "각자 계정으로 쓰려한다.", "개인관리 링크 / 공유관리 링크 구분 지으면 어떨까?", 권한·비밀글 처리 안내 뒤 "응 개발 착수하자." (2026-11-10)

## 요구 대응

| 요구 | 화면 | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| 다른 계정의 페이지를 각자 계정으로 함께 관리 | 페이지 전환, 초대 수락, 공동 관리자 메뉴 | 멤버 가드, `/api/me/pages`, 초대·멤버 경로 | `page_members`, `page_invites` | 0243, 0244 |
| 지표·통계를 함께 봄 | 기존 지표·통계 화면 | `GET /api/me/analytics` 대상 페이지 적용 | 변경 없음 | 0243, 0244 |
| 개인관리·공유관리 구분 | 전환 메뉴의 `내 페이지`, `공유 페이지` | `access` 필드 | `page_members` 유무 | 0243, 0244 |
| 비밀글·숨긴 글을 공동 관리자가 관리(R19) | 기존 방명록 관리 | 방명록 서비스의 관리 권한 판정 | 변경 없음 | 0243 |
| 처리방침 고지 | `/privacy` | 없음 | 없음 | 0244 |

R6의 계정당 페이지 1개는 바꾸지 않습니다. 페이지 전용 계정과 `landings.user_id` UNIQUE 해제는 쓰지 않습니다.

## 구성과 흐름

```text
브라우저 → /api/backend/* (BFF, X-Crelink-Page 검증 후 전달) → SessionGuard → PageAccessGuard → 서비스(대상 계정 id)
```

- **개인관리 페이지:** 로그인한 계정의 페이지입니다. 공동 관리자가 있으면 소유자에게는 `공유 중`으로 표시합니다.
- **공유관리 페이지:** 다른 사람 계정의 페이지에 초대받아 관리하는 페이지입니다.
- 관리 화면(`/me/landings/[publicId]/…`)은 주소의 `publicId`를 모든 API 호출의 `X-Crelink-Page` 헤더로 보냅니다. **개인 페이지에서도 보냅니다.** 활성 페이지를 쿠키나 저장소에 두지 않습니다(탭마다 달라야 함).
- BFF는 `^[a-z0-9]{10}$`에 맞는 `X-Crelink-Page`만 API로 넘깁니다. 지금 BFF는 헤더를 새로 만들므로 이 전달이 없으면 공유 화면의 저장이 개인 페이지로 들어갑니다.

## 데이터 모델

`apps/api/migrations/0014_shared_pages.sql`. 새 테이블만 추가합니다. 0004의 `lock_timeout`과 되돌림 주석 관례를 따릅니다.

```sql
CREATE TABLE page_members (
  page_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_user_id, member_user_id),
  CHECK (page_user_id <> member_user_id)
);
CREATE INDEX page_members_member_idx ON page_members (member_user_id);

CREATE TABLE page_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX page_invites_page_idx ON page_invites (page_user_id);
```

- 소유자는 `landings.user_id`이고 `page_members`에는 공동 관리자만 넣습니다. 역할 컬럼은 두지 않습니다.
- 초대 토큰은 32바이트 난수(base64url)이고 SHA-256 hex만 저장합니다. 유효 72시간, 1회용입니다. 새 초대를 만들면 그 페이지의 미사용 초대를 지웁니다.
- 보존 작업(`retention.service.ts`)에 만료·사용 후 7일이 지난 `page_invites` 삭제를 추가합니다.
- 공동 관리자는 페이지당 최대 5명입니다.

## 권한 규칙 (`PageAccessGuard`)

`SessionGuard` 뒤에서 매 요청 DB로 판정합니다. 파라미터 데코레이터는 가드가 넣은 값만 읽습니다.

| 조건 | 결과 |
| --- | --- |
| 헤더 없음 | 대상은 본인, 역할 `owner`(기존 동작과 AI 호출 유지) |
| 헤더가 있고 AI 행위자 | 403 `forbidden` |
| 헤더의 페이지가 없음, 대상 계정이 `kind='human'`이 아님, 본인도 멤버도 아님 | 404 `page_not_found`(존재 여부를 드러내지 않음) |
| 본인 페이지 | 역할 `owner` |
| 멤버이고 대상 계정이 정지 | 403 `page_suspended` |
| 멤버 | 역할 `editor` |
| 소유자 전용 경로를 `editor`가 호출 | 403 `page_owner_only` |

- `request.pageContext = { ownerUserId, role, publicId, shared }`만 추가합니다. **`request.sessionUser`와 `request.actor`는 덮어쓰지 않습니다**(감사 기록과 Sentry는 실제 사람 id를 유지).
- 멤버 해제는 다음 요청부터 바로 적용됩니다. 캐시하지 않습니다.

### 경로 분류

| 분류 | 경로 |
| --- | --- |
| 편집자 허용 | `GET`·`PATCH /me/landing`, `PUT /me/socials`, `/me/links` 전체, `/me/portfolio` 전체, `/me/banners` 전체, `/me/imports/instabio` 전체, `POST /me/files`, `GET /me/analytics` |
| 소유자 전용 | `GET /me/short-link/availability`, `PUT /me/short-link/slug`, `PUT /me/ad-block`, 초대 만들기·취소, 멤버 목록·해제 |
| 적용 금지 | `/auth/*`, `GET /me`, 방명록 경로, `/admin/*`, AI 운영자 경로, 공개 경로(`GET /files/:id`, 공개 랜딩, 단축 주소, 수집 경로) |

방명록은 작성자 id가 사람이어야 하므로 가드를 붙이지 않고 `guestbook.service.ts`의 `landing.user_id` 비교(목록, 작성 응답, 숨김)를 "소유자 또는 대상이 정지되지 않은 페이지의 멤버" 판정으로 바꿉니다.

`GET /me/analytics`의 `kind='human'` 조건은 대상이 사람 계정이므로 그대로 둡니다.

## API 계약

`packages/shared`에 확정합니다. 오류 본문은 기존 형식을 따릅니다.

| 메서드·경로 | 권한 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- | --- |
| `GET /api/me/pages` | 로그인 | 없음 | `{ pages: [{ publicId, displayName, avatarUrl, access: 'personal' \| 'shared', role: 'owner' \| 'editor', hasMembers }] }`. 본인 페이지가 먼저, 대상 정지 페이지는 제외 | 401 |
| `POST /api/me/page-invites` | 소유자 | 없음 | 201 `{ token, expiresAt }`(토큰은 이때만 반환) | 403, 409 `page_member_limit` |
| `DELETE /api/me/page-invites` | 소유자 | 없음 | 204 | 403 |
| `GET /api/me/page-members` | 소유자 | 없음 | `{ members: [{ userId, email, createdAt }], invite: { expiresAt } \| null, limit: 5 }` | 403 |
| `DELETE /api/me/page-members/:userId` | 소유자 | 없음 | 204 | 403, 404 `member_not_found` |
| `DELETE /api/me/page-members/me` | 편집자 | 없음 | 204 | 403 |
| `POST /api/page-invites/preview` | 로그인 | `{ token }` | `{ publicId, displayName, avatarUrl, expiresAt }` | 404 `invite_invalid`(없음·만료·사용됨 통합), 409 `invite_own_page`, 409 `already_member` |
| `POST /api/page-invites/accept` | 로그인(사람만) | `{ token }` | `{ publicId }` | 위와 같음, 409 `page_member_limit`, 403 `page_suspended` |

- `CreatorLandingState`에 `pageAccess: { role, shared }`를 더합니다.
- 수락은 트랜잭션에서 소유자 행을 잠그고 `UPDATE … WHERE used_at IS NULL AND expires_at > now()`로 소비합니다. 소비한 뒤 인원 초과나 자기 페이지면 롤백해 토큰을 남깁니다.
- `/me/page-members/me`는 `:userId`보다 먼저 매칭되어야 합니다.

## 화면 상태와 API 대응

새 시각 요소는 만들지 않습니다. `ProfileMenu`, `EditSheet`, `.secondary`, `.notice-box`, `ActionStatus`를 재사용합니다(카탈로그 1장).

| 화면 | 동작 |
| --- | --- |
| 페이지 전환 | 프로필 메뉴에 `내 페이지`와 `공유 페이지` 목록. 공유 페이지가 하나도 없으면 전환 묶음을 숨깁니다 |
| 현재 위치 표시 | 공유 페이지를 편집 중이면 관리 화면 머리에 `공유 페이지 · <이름>`을 늘 보입니다. 저장 대상을 착각하지 않게 하기 위함입니다 |
| 공동 관리자 메뉴(`/me/landings/[publicId]/members`, 옛 `/settings` 리디렉트는 유지) | 소유자: 멤버 이메일 목록, 내보내기, `초대 링크 만들기`, 복사, 만료 시각, 취소. 편집자: `이 페이지에서 나가기` |
| 편집자에게 숨김 | 주소 변경, 광고 블록 켜고 끄기. 숨겼는데 403이 오면 기존 `ActionStatus`로 안내합니다 |
| 초대 수락 `/invite#<token>` | 토큰은 URL 프래그먼트에 둡니다(서버 로그·Referrer·Sentry에 남지 않음). 페이지 이름과 "수락하면 내 이메일이 소유자에게 보여요"를 보이고 `수락`, `거절`. 비로그인이면 `sessionStorage`에 토큰을 두고 로그인 뒤 복귀합니다. 복귀 시 토큰이 없으면 "초대 링크를 다시 열어 주세요" |
| 오류 | `invite_invalid`, `invite_own_page`, `already_member`, `page_member_limit`, `page_suspended`에 각각 문구. 해제된 뒤 `page_not_found`면 기존 찾을 수 없음 안내와 내 페이지로 가는 링크 |
| 되돌릴 수 없는 행동 | 내보내기와 나가기는 `EditSheet` 확인 단계를 쓰고 첫 초점은 취소입니다. `window.confirm`을 새로 쓰지 않습니다 |
| 초대 페이지 | `/invite`를 `ROBOTS_DISALLOW`에 넣습니다 |

`layout.tsx`의 `own` 판정은 "주소의 publicId를 헤더로 보낸 `GET /me/landing` 결과"로 바꿉니다. 404면 지금의 찾을 수 없음 안내입니다. `/me`는 지금처럼 본인 페이지로 갑니다.

## 권한·보안·개인정보

- 초대 링크는 받는 사람을 묶지 않습니다. 1회용과 72시간 만료로 위험을 줄입니다.
- 멤버 이메일은 소유자에게만 보입니다. 편집자에게 소유자·다른 멤버의 이메일을 주지 않습니다.
- 처리방침(`apps/web/src/app/(public)/privacy/page.tsx`)을 기능과 같은 배포로 고칩니다: 수집 항목에 공동 관리 관계·초대 기록, 방명록 비밀글·숨긴 글 열람자에 공동 관리자, 해제 후 처리, 통계 열람자에 공동 관리자.
- 페이지 삭제는 없습니다. 소유권 이전도 없습니다.

## 비기능 요구

가드는 요청당 쿼리 1회입니다. 헤더가 없으면 쿼리하지 않습니다. 동시 저장 제어는 넣지 않습니다. 순서 저장이 400으로 충돌하면 새로고침 안내를 보입니다.

## 범위 밖

헤더 없는 사람의 `/me` 쓰기를 400으로 막는 강제(웹 안정화 뒤 별도 티켓), 변경 이력, 소유권 이전, 페이지 삭제, Expo 앱, 미병합 0233 본인 뱃지와의 연결.

## 티켓 분해

| 티켓 | 역할 | 선행 | 확인 |
| --- | --- | --- | --- |
| [0242](../work/orchestrator/0242-shared-pages-design.md) | orchestrator | — | `pnpm docs:check`, `pnpm work:check` |
| [0243](../work/api/0243-shared-pages-api.md) | api | 0242 | 새 e2e 포함 `pnpm verify` |
| [0244](../work/web/0244-shared-pages-web.md) | web | 0243 | `pnpm verify`, 로컬 두 계정 시나리오 |
| [0245](../work/orchestrator/0245-shared-pages-integration.md) | orchestrator | 0243, 0244 | 독립 QA 합격, 병합 뒤 Deploy와 운영 주소 |

## 검증 계획

독립 QA는 다음만 봅니다: 비멤버의 대상 위조 404, 해제 멤버 즉시 차단, 편집자의 소유자 경로 403, **BFF를 통과한** 공유 저장이 대상 페이지에만 반영, 파일 업로드 소유자, 정지 대상 403, 비밀글·숨김 범위, 통계 일치, 초대 재사용·만료, 수락은 POST만, 토큰 해시 저장, AI 행위자의 헤더 거부, 공개 랜딩 무변화.
