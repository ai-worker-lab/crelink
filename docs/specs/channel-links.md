# 채널별 짧은 주소 기술 설계

- 상태: 승인
- 작성일: 2026-11-10
- 티켓: [0246](../work/orchestrator/0246-channel-links.md)(api), [0247](../work/web/0247-channel-links-web.md)(web), [0248](../work/infra/0248-channel-links-edge.md)(infra). 에픽은 두지 않는 독립 티켓입니다.
- 입력: 기존 단축 도메인([백엔드 API 운영 안내](../../apps/api/docs/README.md#단축-도메인)), 방문 UTM 수집([공개 방문 계측](../../apps/api/docs/visitor-telemetry.md))
- 승인 근거: 사용자 발언 "좋아 그럼 그렇게 진행하자."(2026-11-10). CTO 검토 8건을 이 문서에 반영했습니다.
- 기준 커밋: `origin/main` 06bc1a9

## 작업 전 성공 기준

| 항목 | 내용 |
| --- | --- |
| 왜 하는가 | 인스타그램 등 외부에 UTM·슬러그·채널 이름이 드러나지 않는 짧은 주소를 고르기만 해서 만들고, 통계의 `알 수 없음`을 채널별 값으로 바꾼다 |
| 완료 기준 | 아래 `수용 기준` 전부. 사용자 관점: 관리 화면에서 `인스타그램 · 프로필`을 고르면 `go.shaul.kr/s/xxxxxxx`가 나오고, 그 주소로 들어온 방문의 UTM 소스가 통계에 `instagram`으로 나온다 |
| 효과 지표 | 사용자가 프로필에 주소를 넣은 뒤 7일 시점에 badajjack의 UTM 소스에 `instagram` 행이 있는지. 건수가 적어 `알 수 없음` 비율 개선 폭은 판단하지 않는다. 사용자가 넣기 전에는 측정 불가 |
| 위험과 QA 범위 | 기존 `/{slug}`·`/c/`·`/a/`·`/b/` 동작 회귀, 다른 사람 페이지의 주소 조작, 페이지·계정 삭제 뒤 난수 재사용, 공개 랜딩 진입 루프, migration 적용 |
| 실패 시 | 운영 장애면 직전 릴리스로 롤백. migration은 되돌리지 않는다. 새 표는 기존 코드가 읽지 않으므로 롤백해도 남겨 둔다 |

## 주소와 동작

- 형식: `GET {SHORT}/s/{code}`. `code`는 `[a-z0-9]` 7자이며 라우팅·검증은 7~10자를 받는다(나중에 길이만 늘릴 수 있게). 생성은 기존 `insertWithRandomId`를 쓴다.
- 슬러그는 3자 이상이라 `/s/`와 겹치지 않는다. `@Get('s/:code')`로 기존 `:slug`와 분리하고, `SHORT_DOMAIN_ROUTES`에 `{ path: 's/\\:code', method: RequestMethod.GET }`를 더하며(빠지면 `/api/s/:code`로 등록된다), `infra/prod/Caddyfile`의 `@click` 정규식에 `s/[a-z0-9]{7,10}`를 더한다. pass는 기존과 같이 `issue(publicId, Date.now(), visitorId)`로 발급한다(방문자 없는 pass는 `page_view`가 남지 않는다).
- 처리 순서: code 조회 → 없거나 페이지가 삭제됨: `link_not_found` 안내 → 정지 계정: `creator_suspended` 안내 → 방문 기록(`recordVisit`) → `{WEB}/p/{publicId}?pass=…&via={code}`로 302.
- 방문의 UTM은 저장값만 쓴다. `{ ...requestFacts(...), utm: 저장값 }`으로 덮어써 요청 쿼리의 `utm_*`를 무시한다. `visits.slug`에는 `short_slugs`의 현재 슬러그(`retired_at IS NULL`)를 넣는다. 저장값은 `source`, `medium`, `campaign`, `content`, `id`(= code)다. `id`가 있으므로 릴스 한 편 단위 구분은 기존 `UTM ID` 분포에서 볼 수 있다.
- **보관된 주소도 계속 동작한다.** 보관은 관리 목록에서만 숨긴다.

## 최종 주소창에 UTM을 남기지 않기

리디렉트 주소에는 UTM 대신 `via={code}`만 붙인다.

- 공개 랜딩 API(`GET /api/public/landings/{publicId}`)가 `via`를 받는다. 이 페이지의 code이면(보관 여부와 무관, `archived_at IS NULL` 조건을 넣지 않는다) 응답의 `shortUrl`을 `{SHORT}/s/{code}`로 주고, `utm`을 함께 준다. 그 밖의 `via`는 조용히 무시한다. 웹은 `via`를 문자열로 정규화해 `loadLanding`의 세 번째 인자로 넘겨 요청당 1회만 호출한다.
- 웹 공개 페이지는 `via`로 받은 API의 `utm`을 `VisitorTracker`에 넘긴다(안 넘기면 `{}`가 저장된다). 없으면 지금처럼 `readLandingUtm(query)`를 쓴다.
- `PassCleanup`은 지금처럼 `pass`만 지운다. `via`는 주소창에 남고, 새로고침·복사로 다시 들어오면 기존 판정(`!passAccepted` → `shortUrl`로 리디렉트)을 타서 `/s/{code}`를 거쳐 채널 UTM으로 기록된다. 이 흐름이 루프가 되지 않는지 시험한다.
- 사용자가 손으로 만든 `?utm_*` 주소는 기존 동작 그대로 둔다.

## 데이터 (`0015_channel_links.sql` 1건, 새 표 2개, 첫 줄 `SET LOCAL lock_timeout = '5s';`)

```sql
-- 한 번 발급한 code의 영구 기록. 지우지 않으며 FK가 없어 페이지·계정 삭제의 영향을 받지 않는다.
CREATE TABLE channel_link_codes (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9]{7,10}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- code의 현재 의미. 페이지가 삭제되면 CASCADE로 함께 지워져 개인 맥락이 남지 않고 code만 남는다.
CREATE TABLE channel_links (
  code text PRIMARY KEY REFERENCES channel_link_codes (code),
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  channel text NOT NULL,
  placement text NOT NULL,
  campaign text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX channel_links_active ON channel_links (landing_id, channel, placement, campaign) WHERE archived_at IS NULL;
CREATE INDEX channel_links_landing ON channel_links (landing_id);
```

- 두 표로 나눈 이유: 삭제 시 내용은 자동으로 지워지고 code는 재발급되지 않아야 한다. 트리거나 서비스 코드의 삭제 처리에 의존하지 않는다.
- `RetentionService` 대상이 아니다.
- migration 번호: 실행기가 파일명 전체로 적용 여부를 보므로(`apps/api/src/database.ts`) 진행 중 브랜치의 `0014_*` 두 파일과 병합 순서가 무관하다. 적용 뒤 파일명을 바꾸면 기동이 막히므로 바꾸지 않는다.

## 프리셋 (`packages/shared/src/channel-links.ts`, 값 고정)

| channel (`utm_source`) | 표시 이름 | placement (`utm_content`) |
| --- | --- | --- |
| `instagram` | 인스타그램 | `bio` 프로필, `story` 스토리, `reels` 릴스, `post` 게시물, `dm` DM, `ad` 광고 |
| `youtube` | 유튜브 | `channel` 채널 소개, `description` 영상 설명, `shorts` 쇼츠, `community` 커뮤니티, `ad` 광고 |
| `tiktok` | 틱톡 | `bio` 프로필, `video` 영상, `dm` DM, `ad` 광고 |
| `threads` | 스레드 | `bio` 프로필, `post` 게시물 |
| `x` | X | `bio` 프로필, `post` 게시물, `ad` 광고 |
| `facebook` | 페이스북 | `bio` 프로필, `post` 게시물, `ad` 광고 |
| `naver_blog` | 네이버 블로그 | `bio` 프로필, `post` 글 |
| `kakao` | 카카오톡 | `channel` 채널, `chat` 대화 |

- `utm_medium`: placement가 `ad`이면 `paid_social`, 그 밖은 `social`.
- `utm_campaign`: 입력이 비어 있으면 `bio`는 `profile`, 그 밖은 `general`. 입력값은 소문자로 바꾸고 공백·`_`는 하이픈으로 바꾼 뒤 `[a-z0-9가-힣-]`만 남기며 40자로 자른다. 입력이 있는데 결과가 비면 400이다.
- 직접 입력 채널은 이번 범위에서 뺀다.

## API (`/api/me/channel-links`, `SessionGuard`+`CurrentUser`, 세션 사용자의 페이지만)

- `GET`: 보관되지 않은 주소 목록(`code`, `url`, `channel`, `placement`, `campaign`, `createdAt`), 최신순. 운영자 대행 경로는 만들지 않는다.
- `POST {channel, placement, campaign?}`: 같은 조합의 보관되지 않은 주소가 있으면 그것을 돌려준다(200). 없으면 새로 만든다(201). 프리셋에 없는 조합은 400 `validation_failed`.
- `POST …/{code}/archive`: 보관(204, 이미 보관이면 204). 남의 code·없는 code는 404 `channel_link_not_found`.
- 한도: `CHANNEL_LINK_LIMITS.perLanding = 50`(보관 제외), `CHANNEL_LINK_LIMITS.totalPerLanding = 200`(보관 포함, 만들고 보관하기를 반복하는 것을 막는다). 초과는 409 `channel_link_limit_reached`·`channel_link_total_limit_reached`.
- `creator.controller.ts`의 `me/*`와 같은 형태로 만들고, 보관은 `WHERE code=$1 AND landing_id=(본인 랜딩)`으로 제한한다. 공유관리(0243)는 `X-Crelink-Page` 헤더로 페이지를 고르므로 `@PageOwnerOnly()`를 붙여 소유자 전용으로 하고(멤버는 403 `page_owner_only`), 서비스에는 `PageContext.ownerUserId`를 넘긴다. `/s/{code}`와 공개 랜딩 `via`는 공개 경로라 가드를 붙이지 않는다.
- 생성 동시성: 트랜잭션 첫 줄에서 사용자 행을 잠근다(`links.service.ts`와 같은 방식). 기존 조합 조회 → 한도 검사 뒤 `insertWithRandomId`는 `channel_link_codes`에만 쓰고(겹침만 재시도), 그다음 `channel_links`를 넣는다.
- 웹 BFF(`apps/web/src/app/api/backend/[...path]/route.ts`)의 허용 목록에 목록·생성·보관의 메서드별 규칙을 더한다.

## 화면 (상한: 메뉴 1개·화면 1개, 새 디자인 문서 없음)

설정 페이지는 리디렉트 껍데기라 쓸 수 없다. `MANAGER_MENU`에 `채널 주소`를 한 줄 더하고 `app/me/landings/[publicId]/channels/page.tsx`를 기존 컴포넌트로 만든다. 배열 등록이 빠지면 편집 미리보기가 붙는다.

- 입력: 채널 선택, 노출 위치 선택(채널에 따라 바뀜), 캠페인 이름(선택), `주소 만들기` 버튼.
- 목록: `인스타그램 · 프로필`(캠페인이 기본값이 아니면 뒤에 표시), 주소, 복사 버튼, `보관` 버튼. 비었을 때 한 줄 안내.
- 안내 문구: "보관해도 이미 공유한 주소는 계속 열려요." 한도 도달 시 사유 표시.
- 복사·오류 처리는 기존 `CopyButton`·`ActionStatus`를 쓴다. 390px·1280px에서 가로 넘침이 없어야 한다.
- 뺀 것: 통계 화면의 한글 라벨, 주소별 클릭 수, 직접 입력 채널, 보관 해제.

## 수용 기준

1. `GET {SHORT}/s/{code}`가 302로 `/p/{publicId}?pass=…&via={code}`에 보내고, 응답 Location에 `utm_`이 없다.
2. 그 방문의 `visits.utm`과 `page_view`의 `utm`이 저장 프리셋과 일치하고, 요청 쿼리의 `utm_*`는 무시된다.
3. 없는 code와 삭제된 페이지의 code는 `link_not_found`, 정지 계정은 `creator_suspended` 안내다.
4. 보관한 code는 계속 302로 동작하고 목록에서만 빠진다.
5. 페이지를 삭제하면 `channel_links` 행은 사라지고 `channel_link_codes` 행은 남으며, 같은 code가 발급되지 않는다. main에 페이지·계정 삭제 기능이 없어 시험 DB에서 SQL로 확인한다.
6. 다른 사용자의 페이지에 대한 `GET`·`POST`·보관이 거부된다.
7. 같은 조합의 `POST`를 동시에 보내도 활성 행은 1개이고 같은 주소를 돌려준다. 한도 초과는 거부된다.
8. `via` 없는 기존 `/{slug}`, 수동 `?utm_*`, `/c/`·`/a/`·`/b/`의 동작과 시험이 그대로 통과한다. 예외는 `apps/api/test/health.e2e-spec.ts`의 `/api` 밖 경로·테이블·migration 목록이며 같은 변경에서 갱신한다.
9. pass 만료 또는 pass 없이 `via`만 있는 주소로 들어오면 `/s/{code}`를 한 번 거쳐 정상 표시되고 리디렉트 루프가 없다. 다른 페이지의 code를 `via`로 주면 무시된다.
10. Caddy에서 `/s/{7~10자}`만 API로 가고 6·11자·대문자·끝 슬래시는 404다. `infra/prod/tests/caddy-routing.sh`에 추가해 Docker로 직접 돌린다(CI에 없음). `infra/prod/verify.sh`에 `/s/zzzzzzz` 302와 `notice?reason=link_not_found`를 추가한다.
11. 관리 화면에서 주소 만들기·복사·보관이 390px·1280px로 ego-browser에서 동작한다.
12. `pnpm ci:local --report` 통과, 관리 화면·공개 랜딩을 건드리므로 `gh workflow run CI --ref <브랜치>` 통과.

## 릴리스

- 되돌리기 어려운 migration과 공개 랜딩 경로가 있어 독립 `qa` 합격 뒤 병합한다.
- 병합 뒤 Deploy job 결과와 운영 주소를 본다. 운영 확인은 쓰기 없는 요청(`/s/zzzzzzz` 안내 화면)까지만 하고, 첫 주소는 사용자가 관리 화면에서 만든다.
- 롤백 시 옛 Caddyfile로 돌아가 공유한 `/s/` 주소가 재배포 전까지 404가 된다.
