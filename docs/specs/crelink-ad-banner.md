# 광고 블록과 크리에이터 배너 슬롯 기술 설계

- 상태: 초안
- 작성일: 2026-10-09
- 에픽: `docs/work/epics/0063-ad-banner-block.md`
- 입력: PRD R20·R21과 관련 R4·R5·R7·R9·R10·R11·R13·R14·R18·R19([docs/product/crelink.md](../product/crelink.md), R20·R21 수용 기준은 2026-10-09 채택), 디자인 인계 [design/ad-banner-block/handoff.md](../../design/ad-banner-block/handoff.md)(2026-10-09 사용자 승인, `사용자 결정` 1~7과 `기술 검토` 절), [디자인 시스템](../../design/system/DESIGN.md) 광고 블록·모션 줄, 기존 설계 [MVP](crelink-mvp.md)·[방명록](crelink-guestbook.md)·[운영 배포](crelink-prod-deploy.md). 새 기술 조사·ADR 없음(새 의존성 없음).
- 설계 티켓: `docs/work/orchestrator/0065-ad-banner-block-design-spec.md`

작성 절차와 분해 규칙은 [기술 설계와 티켓 분해](README.md)를 따릅니다. `[AI 제안]`은 이 설계가 고른 안으로, 사용자가 설계를 승인할 때 함께 확정합니다. `[임시값]`은 써 본 뒤 바꿀 수 있는 값입니다. 사용자 결정이 필요한 것은 [미정](#미정)에 모았습니다.

## 핵심 결정

1. 광고 블록·배너 슬롯은 리스트형 구역(`landing_blocks`) 안의 한 항목입니다. 위치는 `landing_blocks.slot_position`(NULL은 맨 뒤) 하나이고, 슬롯 부여 여부(`users.banner_slot_granted_at`)로 광고 블록과 배너 슬롯 중 무엇을 그릴지 정합니다. 부여·회수로 위치는 바뀌지 않습니다.
2. 크리에이터 배너는 **랜딩 단위**로 저장합니다(`creator_banners.landing_id`). 부여는 계정 단위입니다. `[AI 제안]`, [미정 2](#미정).
3. 슬롯 배치·숨김 규칙은 `packages/shared`의 순수 함수 `resolveBannerSlot` 하나로 두고, 공개 랜딩 API와 관리 화면 미리보기(`toLandingPreview`)가 함께 씁니다. 숨김일 때도 사유와 위치를 돌려줘 미리보기가 점선 자리를 그립니다.
4. 노출은 **공개 랜딩 API가 `passAccepted`일 때 첫 장 1건**을 서버에서 기록합니다(비콘 없음). R7 ⑥은 따로 막지 않아도 지켜집니다. `[AI 제안]`
5. 광고 클릭은 `{SHORT}/a/{배너}/{랜딩}`, 크리에이터 배너 클릭은 `{SHORT}/b/{배너}`입니다. 광고 클릭 주소는 `passAccepted`일 때만 내려 줍니다. Caddy와 `SHORT_DOMAIN_ROUTES`에 두 경로를 더합니다.
6. 광고 노출·클릭은 개인 식별 정보 없이 날짜·배너·랜딩별 카운터(`ad_banner_daily_stats`)로 남깁니다. 크리에이터 배너 클릭은 링크 클릭처럼 원본(`creator_banner_clicks`)으로 남기고, 1년 보존한 뒤 집계로 옮깁니다.
7. 크리링 배너 순서는 `ad_banners.sort_order`와 `PUT /api/admin/ad-banners/order`(전체 id)로 정합니다. 운영자 표의 노출·클릭은 카운터 합계 질의입니다.
8. 배너 슬롯 한도는 API 환경변수 두 개로 둡니다. `BANNER_SLOT_MAX`는 보이는 배너 상한이고 처음 값은 5입니다. `BANNER_SLOT_TOTAL_MAX`는 숨김 포함 보관 상한이고 처음 값은 20입니다. `[임시값]`
9. 움직이는 배너(GIF·움직이는 WebP·APNG)도 받습니다. 올릴 때 브라우저가 첫 장면을 3:1 정지 이미지로 만들어 함께 저장합니다. `prefers-reduced-motion`이면 정지 이미지를 보여 주고, 움직이는 배너에는 멈춤 버튼을 둡니다. `[AI 제안]`, [미정 1](#미정).
10. 차단 도메인을 추가하면 기존 크리에이터 배너는 링크처럼 차단하고, 걸리는 크리링 배너는 내립니다(게시 끝 = 지금). `[AI 제안]`, [미정 3](#미정).
11. 기능 티켓은 통합 브랜치 `work/0063-ad-banner-integration`에 모읍니다. main에는 통합 티켓에서 한 번에 머지합니다(방명록 0050과 같은 방식). 예외는 Caddy 티켓으로, 혼자 먼저 main에 머지해도 안전합니다([통합과 배포 순서](#통합과-배포-순서)).

## 요구 대응

| 요구 | 화면·상태(디자인) | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R20 ① 슬롯 없는 랜딩마다 광고 블록 1개, 처음 맨 뒤 | 공개 랜딩 `광고 블록`(handoff `공개 랜딩`) | `PublicBlockView.slot`(`kind: 'ad'`) | `landing_blocks.slot_position` NULL = 맨 뒤(백필 없음), `users.banner_slot_granted_at` NULL | 예정 T1, T2, T9 |
| R20 ② 링크처럼 끌어 옮김, 공개 랜딩 반영, 삭제·숨기기 없음 | `페이지 편집` 외부 링크 패널의 광고 행(손잡이만), `광고 블록` 패널 | `PUT /api/me/links/order`(`LinkOrderRequest.slotIndex`) | `slot_position` | 예정 T1, T2, T10, T11 |
| R20 ③ `광고` 표시 | 조작 줄 `광고` 배지, 영역 이름 `크리링 광고` | `slot.kind` | — | 예정 T9 |
| R20 ④ 운영자 등록·수정·내리기·순서, GIF 받음, 넘기기(스와이프·버튼·키보드), 자동 넘김 없음 | 운영자 `/admin/ad-banners`, 공개 랜딩 캐러셀 | `GET·POST /api/admin/ad-banners`, `PATCH …/{id}`, `PUT …/{id}/end`, `PUT …/order` | `ad_banners`(`sort_order`, `starts_at`, `ends_at`) | 예정 T1, T5, T9, T13 |
| R20 ⑤ 광고 고르기 화면 없음 | 없음 | 없음 | 없음 | — |
| R20 ⑥ 게시 0장이거나 보이는 링크·포트폴리오 0개면 숨김 | 공개 랜딩 숨김, 미리보기 점선 자리 | `resolveBannerSlot` → `hidden` 사유, 공개 응답 `slot: null` | — | 예정 T1, T2, T9, T11 |
| R20 ⑦ 링크 한도에 들지 않음 | 한도 배지가 광고 행을 세지 않음 | `LinkLimits` 계산 그대로 | `links`만 셈 | 예정 T10 |
| R20 ⑧ 노출·클릭 랜딩·배너별 기록, 서비스 화면 제외, 운영자 표에서 봄 | 운영자 표 노출·클릭 열과 도움말 | 공개 랜딩 API 노출 기록, `GET {SHORT}/a/{배너}/{랜딩}`, `AdBannerView.impressions`·`clicks` | `ad_banner_daily_stats` | 예정 T2, T5, T7, T8, T13 |
| R20 ⑨ 연결 URL `http`·`https`, 차단 목록 | 운영자 대화상자 오류 | `link_url_invalid` 400, `link_domain_blocked` 422 | `ad_banners.host` | 예정 T5, T13 |
| R21 ① 계정 단위 부여, 모든 랜딩에서 같은 위치가 배너 슬롯, 광고 안 나옴 | 운영자 크리에이터 상세 `배너 슬롯` 부여 | `PUT /api/admin/creators/{userId}/banner-slot` | `users.banner_slot_granted_at` | 예정 T6, T14 |
| R21 ② 배너 추가·수정·삭제·순서·숨기기, n은 보이는 배너 기준·설정값, 보관 상한, 한도 안내, GIF 받음 | `배너 슬롯` 패널·배너 폼 | `POST /api/me/banners`, `PATCH·DELETE …/{id}`, `PUT …/order`, `banner_limit_reached`·`banner_total_limit_reached` 409 | `creator_banners`, `BANNER_SLOT_MAX`·`BANNER_SLOT_TOTAL_MAX` | 예정 T1, T4, T15, T16 |
| R21 ③ 2장 이상 넘김, 1장 한 장, 0장 숨김 | 공개 랜딩 배너 슬롯, 미리보기 점선 자리 | `resolveBannerSlot` | — | 예정 T1, T2, T9, T11 |
| R21 ④ 연결 URL R4 ⑤·R14, 클릭 기록, 배너별 차단·유지 | 배너 폼 오류, `차단됨` 행, 운영자 `배너` 카드 | `GET {SHORT}/b/{배너}`, `PUT /api/admin/banners/{id}/block` | `creator_banner_clicks`, `creator_banners.blocked_at` | 예정 T4, T6, T7, T8, T14, T15 |
| R21 ⑤ 회수 시 광고 블록으로, 배너 보관·재부여 시 그대로 | 운영자 `회수`, 편집 중 회수 안내 | 같은 `banner-slot`, `banner_slot_not_granted` 403 | `banner_slot_granted_at` NULL, 배너 행 유지 | 예정 T4, T6, T14, T15, T16 |
| R21 ⑥ 링크 한도에 들지 않음 | 배지 분리 | `BannerLimits`와 `LinkLimits`가 따로 | — | 예정 T4, T15 |
| R4 ⑤·R14 ①③ | 배너 폼·운영자 대화상자 오류, 차단 표시 | 위와 같음 | 차단 도메인 추가 시 배너 처리 | 예정 T4, T5, T6 |
| R7 ⑥ | 관리 미리보기·운영자 화면에서 연 랜딩은 세지 않음 | `passAccepted` 기준 | — | 예정 T2, T17 |
| R9·R11 | `/privacy` 고지 | 보존 작업 | `creator_banner_clicks` → `creator_banner_click_rollups` | 예정 T7, T9 |
| R10 | 운영자 화면에서만 봄 | `OperatorCreatorStats.bannerClicks`([미정 4](#미정)) | — | 예정 T7, T14 |
| R16 | 390·1280·320px 가로 넘침 없음 | — | — | 예정 T9~T16, T17 |
| R18 | `페이지 편집` 미리보기·패널·하단 시트 | `CreatorLandingState` 추가 필드 | — | 예정 T10, T11, T15, T16 |
| R19 | 방명록 탭을 켠 랜딩은 `링크` 탭 안에만 | 변경 없음 | — | 예정 T9 |
| R5 | 리스트형 구역 안 항목(R5 예외, PRD 범위) | `PublicBlockView` 안 | `landing_blocks` | 예정 T1 |

R22는 철회되어 다루지 않습니다.

## 구성과 흐름

공개 랜딩(단축 주소 경유, 무료 랜딩):

```text
방문자 → GET {SHORT}/{slug} → 방문 기록 → 302 {WEB}/p/{publicId}?pass=…
웹 SSR → GET /api/public/landings/{publicId}?pass=…
  API: 랜딩 행(users JOIN에 banner_slot_granted_at 추가) → 병렬: 구역(+ slot_position)·링크(숨김·차단 열 포함 전체)·SNS·포트폴리오·단축 주소·배너 1질의
       (부여됨이면 그 랜딩의 크리에이터 배너, 아니면 게시 중 크리링 배너 sort_order 순)
     → 첫 list 구역에만 resolveBannerSlot → hidden이면 slot: null
     → passAccepted이고 slot.kind = 'ad'이면 첫 장 노출 +1(백그라운드 upsert, 응답을 기다리지 않음)
     → 광고 clickUrl: passAccepted면 {SHORT}/a/{bannerPublicId}/{landingPublicId}, 아니면 저장된 URL
       크리에이터 배너 clickUrl: {SHORT}/b/{bannerPublicId}(링크 /c/와 같이 늘 기록 주소), 연결 URL이 없으면 null
웹: 링크 목록 ul 안 afterLinkCount 자리에 BannerCarousel(li)
```

클릭:

```text
광고 → GET {SHORT}/a/{bannerPublicId}/{landingPublicId}
  API: 배너가 지금 게시 중이고 랜딩이 있고 크리에이터가 정지가 아니면 → clicks +1(백그라운드) → 302 저장된 URL
       아니면 → 302 {WEB}/notice?reason=link_unavailable. 방문자 쿠키를 읽거나 발급하지 않습니다.
크리에이터 배너 → GET {SHORT}/b/{bannerPublicId}
  API: 연결 URL이 있고 숨김·차단이 아니고 계정이 부여됨·정지 아님 → cl_vid → creator_banner_clicks 기록(백그라운드) → 302 저장된 URL
       short_link는 short_links.landing_id = creator_banners.landing_id로 찾습니다(R6 이후에도 맞음).
       아니면 → link_unavailable 안내
```

두 경로 모두 요청 값으로 대상 URL을 만들지 않고 DB에 저장된(저장 때 http·https만 받은) URL로만 보냅니다(열린 리디렉트 방지). `Cache-Control: no-store`.

관리 화면:

```text
GET /api/me/landing → CreatorLandingState(+ slot, adBanners, banners, bannerLimits)
  toLandingPreview(state, drafts) → resolveBannerSlot(공개 API와 같은 함수) → 미리보기 캐러셀 또는 점선 자리(edit 모드, 링크 없음)
외부 링크 패널에서 링크·광고 행·배너 슬롯 행 중 무엇을 끌든 → PUT /api/me/links/order { ids, slotIndex } → LinkView[]
  웹은 보낸 slotIndex(n 이상이면 null로 맞춤)를 편집 상태에 그대로 둠
배너 저장 → POST·PATCH /api/me/banners… → 상태 다시 읽기(한도 배지 갱신, 링크와 같은 흐름)
```

운영자:

```text
/admin/ad-banners(서버 렌더) → GET /api/admin/ad-banners → { items(노출·클릭 누적 포함), counts } → 웹이 item.status로 걸러 봄
등록 → POST /api/me/files(이미지, animated면 정지 이미지도) → POST /api/admin/ad-banners → router.refresh()
/admin/creators/{userId} → GET /api/admin/creators/{userId}(+ bannerSlot, banners, bannerLimits)
  부여·회수 → PUT …/banner-slot { granted }, 배너 차단 → PUT /api/admin/banners/{id}/block
```

## 데이터 모델

migration `apps/api/migrations/0003_ad_banner.sql`. 새로 더하는 것은 NULL을 허용하는 컬럼과 새 테이블뿐입니다(expand, [운영 설계 migration 규칙](crelink-prod-deploy.md#db-migration-운영-규칙)). Blue/Green 겹침 구간의 옛 API는 새 컬럼·테이블을 모르고 그대로 동작합니다. 파일 첫 줄은 `SET LOCAL lock_timeout = '5s';`입니다. `users`·`landing_blocks`·`files` ALTER가 잠금을 잡지 못하면 새 색이 기동·헬스에 실패하고 끝나며, 활성 색은 그대로 남습니다. 그래서 활성 트래픽이 잠금 뒤에 줄을 서지 않습니다.

| 테이블 | 주요 컬럼 | 규칙 |
| --- | --- | --- |
| `users` | `banner_slot_granted_at timestamptz NULL` 추가 | 계정 단위 부여(R21 ①). NULL이면 광고 블록. 값이 handoff의 "부여일"입니다. 회수는 NULL로, 배너 행은 그대로(R21 ⑤). |
| `landing_blocks` | `slot_position integer NULL CHECK (slot_position >= 0)` 추가 | NULL = 맨 뒤(R20 ① 처음 위치, 백필 없음). 값 k = 같은 구역에서 `links.position < k`인 링크들 다음. |
| `files` | `animated boolean NULL` 추가 | 업로드 때 매직 바이트 뒤 움직임을 판정해 저장합니다. NULL(0003 전에 올린 파일)은 "모름"이고, 배너 저장 때 바이트를 읽어 판정한 뒤 채웁니다. [미정 1](#미정)이 A·D면 이 컬럼은 두지 않습니다. |
| `ad_banners` | `id uuid PK`, `public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$')`, `image_file_id → files ON DELETE RESTRICT`, `still_file_id → files ON DELETE RESTRICT NULL`, `alt text NOT NULL CHECK (char_length(alt) BETWEEN 1 AND 100)`, `url text NOT NULL`, `host text NOT NULL`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NULL`, `sort_order integer NOT NULL`, `created_by → users ON DELETE SET NULL`, `created_at`, `updated_at`, `CHECK (ends_at IS NULL OR ends_at >= starts_at)` | 크리링 배너(R20 ④). 삭제 API는 없고 내리기만 있습니다. 운영자 계정을 지우면 `files.owner_user_id` CASCADE가 파일 행을 지우려 합니다. 그런데 `ad_banners` 행이 그 파일을 가리킨 채 남아 있어 삭제가 막힙니다. 그래서 게시 배너 이미지가 사라지지 않습니다(기술 검토 B7). 인덱스는 `(sort_order, created_at)`, `(host)`. |
| `creator_banners` | `id uuid PK`, `public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$')`, `user_id → users ON DELETE CASCADE`, `landing_id → landings ON DELETE CASCADE`, `image_file_id → files NOT NULL`, `still_file_id → files ON DELETE SET NULL NULL`, `alt text NOT NULL CHECK (char_length(alt) BETWEEN 1 AND 100)`, `url text NULL`, `host text NULL`, `CHECK ((url IS NULL) = (host IS NULL))`, `position integer NOT NULL`, `hidden boolean NOT NULL DEFAULT false`, `blocked_at timestamptz NULL`, `blocked_reason text NULL`, `created_at`, `updated_at` | 크리에이터 배너(R21 ②④). `user_id`는 소유·차단 검사용(링크와 같음), `landing_id`는 어느 랜딩의 슬롯에 나오는지를 뜻합니다. 크리에이터를 지우면 배너 행이 같은 문장에서 연쇄 삭제되므로 이미지 FK가 삭제를 막지 않습니다. `public_id`는 기존 `randomId(10)`(`insertWithRandomId`)으로 만들고, Caddy 정규식 `[a-z0-9]{10}`의 원본은 이 CHECK입니다. 인덱스는 `(landing_id, position)`, `(user_id)`, `(host)`. |
| `ad_banner_daily_stats` | `day date`(Asia/Seoul), `ad_banner_id → ad_banners ON DELETE CASCADE`, `landing_public_id text`, `impressions integer NOT NULL DEFAULT 0`, `clicks integer NOT NULL DEFAULT 0`, `PK (ad_banner_id, day, landing_public_id)` | R20 ⑧. 개인 식별 정보가 없습니다. `landing_public_id`는 FK 없는 사본이라 랜딩이 지워져도 누적이 남습니다(`link_clicks.link_public_id`와 같은 방식). 집계 데이터라 계속 보관합니다(R11). |
| `creator_banner_clicks` | `link_clicks`와 같은 컬럼: `id bigint identity PK`, `banner_id → creator_banners ON DELETE SET NULL`, `banner_public_id text NOT NULL`, `short_link_id → short_links ON DELETE CASCADE`, `occurred_at`, `visitor_id`, `ip inet`, `country`, `city`, `referrer_host`, `user_agent`, `device_type`, `browser`, `os` | R21 ④ "외부 링크 클릭처럼". 원본은 1년 보존합니다(R11). 인덱스는 `(short_link_id, occurred_at)`, `(occurred_at)`. |
| `creator_banner_click_rollups` | `day`, `short_link_id → short_links ON DELETE CASCADE`, `banner_public_id`, `clicks`, `PK (short_link_id, day, banner_public_id)` | 보존 작업이 원본을 지우기 전에 만드는 집계입니다(R11 ②③, IP 없음). |

FK 동작은 T1 migration 테스트로 확인합니다. 두 가지를 봅니다. (a) 배너(이미지·정지 이미지)가 있는 크리에이터 `users`를 지우면 성공하고 배너·파일 행이 0건이 됩니다. (b) 크리링 배너 이미지를 올린 운영자를 지우면 23503으로 실패합니다.

### 위치 모델

- 정렬(`PUT /api/me/links/order`)은 링크를 0..n-1로 다시 매기고, 같은 트랜잭션(사용자 잠금 안)에서 `slot_position`을 저장합니다.
  - `slotIndex`가 오면: n 이상이면 NULL, 아니면 그 값.
  - `slotIndex`가 없으면(옛 웹 호환): 다시 매기기 **전에** 지금 슬롯 앞 링크 수 `count(position < k)`를 구하고, 다시 매긴 뒤 그 수를 k로 저장합니다(NULL은 NULL 그대로). 링크를 지워 생긴 빈 번호 때문에 슬롯이 밀리지 않습니다.
  - 새 웹은 링크만 옮겨도 섞인 목록에서 계산한 `slotIndex`를 늘 보냅니다. 링크가 슬롯 행을 건너가면 화면 순서와 저장 순서가 같아야 하기 때문입니다.
- 새 링크는 지금처럼 `max(position) + 1`이라, 슬롯이 맨 뒤(NULL)면 슬롯 앞에, 사이(k)면 슬롯 뒤에 들어갑니다. 링크를 지워도 다시 매기지 않으므로 슬롯은 같은 뒤 링크 앞에 남습니다.
- 편집 상태의 `slotIndex`는 `slot_position`이 NULL이면 null(맨 뒤에 붙어 있음), 아니면 `count(position < k)`입니다. 끝 링크들을 지워 k가 모든 링크 뒤가 되면 `slotIndex = n`이 되고, 새 링크는 슬롯 뒤에 붙습니다. 맨 뒤에 붙이려면 다시 끌어 놓습니다(드문 경우라 문서화만 합니다).
- 공개 응답의 `afterLinkCount`는 전체 순서 중 슬롯 앞에 있는 **보이는** 링크 수입니다. 바로 앞 링크가 숨겨지면 남은 링크 사이의 같은 상대 자리에 보입니다(handoff `숨김`).
- 슬롯은 `position`이 가장 앞인 list 구역에만 붙습니다(`CreatorService.context()`와 같은 기준). 지금은 구역이 1개입니다(R5). 구역이 여러 개가 되어도 광고 블록은 1개입니다(R20 "지금은 1개로 고정").

### 크리에이터 배너 단위 `[AI 제안]`

랜딩 단위(`landing_id`)로 저장하고, 한도(n·보관 상한)도 랜딩마다 셉니다. 부여는 계정 단위(`users`)입니다.

- 배너를 고치는 곳은 랜딩별 관리 화면(`/me/landings/{publicId}` `페이지 편집`)입니다. 계정 단위로 두면 R6 이후 랜딩 A에서 고친 배너가 랜딩 B에서도 바뀌어, 화면 위치와 영향 범위가 어긋납니다.
- 위치(`landing_blocks.slot_position`)·포트폴리오(`landing_id`)·링크(`block_id`)가 이미 랜딩(구역)에 매여 있습니다.
- 지금은 사용자당 랜딩이 1개(R6 ①)라 두 안의 동작 차이가 없습니다. 차이는 R6 이후에 생깁니다. 그때 계정 단위로 바꾸려면 중복을 정리해야 하고, 랜딩 단위로 바꾸려면 랜딩마다 복사해야 합니다. 처음부터 랜딩 단위로 두면 R6 때 데이터를 옮길 일이 없습니다.
- 계정 단위 안: `landing_id`를 빼고 `user_id`만 둡니다. 모든 랜딩이 같은 배너를 보여 줍니다. 사용자 결정은 [미정 2](#미정)입니다.

### 되돌리기

- 운영 데이터가 생기기 전에는 아래 순서로 지웁니다. main 머지는 곧 운영 migration이므로, 운영 DB에서는 명시적 승인을 받은 뒤 손으로 하는 작업입니다. migration 파일 머리 주석에도 같은 내용을 적습니다(0002와 같은 방식).

  ```sql
  DROP TABLE creator_banner_click_rollups, creator_banner_clicks, ad_banner_daily_stats, creator_banners, ad_banners;
  ALTER TABLE files DROP COLUMN animated;
  ALTER TABLE landing_blocks DROP COLUMN slot_position;
  ALTER TABLE users DROP COLUMN banner_slot_granted_at;
  DELETE FROM schema_migrations WHERE version = '0003_ad_banner';
  ```

- 운영 데이터가 생긴 뒤에는 지우지 않고 다음 migration으로 고칩니다(forward fix). 기능만 끄려면 웹·API를 이전 릴리스로 롤백합니다. 새 컬럼·테이블이 남아도 옛 코드에는 영향이 없습니다.

## API 계약 초안

`packages/shared/src/crelink.ts`에 확정합니다(예정 T1). 오류 형식은 기존 `ApiError { code, message }`. 표 안 경로의 `{id}`는 uuid, `{bannerPublicId}`·`{landingPublicId}`는 `[a-z0-9]{10}`입니다.

| 메서드·경로 | 권한 | 요청 | 성공 응답 | 오류(코드·상태) |
| --- | --- | --- | --- | --- |
| `GET /api/public/landings/{publicId}?pass=` | 누구나 | 기존 | `PublicLandingResponse`, `blocks[].slot` 추가 | 기존과 같음 |
| `GET /api/me/landing` | 크리에이터 | — | `CreatorLandingState` + `slot`·`adBanners`·`banners`·`bannerLimits` | 기존과 같음 |
| `PUT /api/me/links/order` | 크리에이터 | `LinkOrderRequest { ids, slotIndex? }` | `LinkView[]`(지금과 같음) | 400 `order_mismatch`·`validation_failed`(slotIndex가 0 이상 정수가 아님) |
| `POST /api/me/files` | 로그인 | 기존 | `UploadFileResponse { fileId, url, animated }`(`animated` 추가, 미정 1이 B·C일 때) | 기존과 같음 |
| `POST /api/me/banners` | 크리에이터(부여됨) | `CreateBannerRequest` | 201 `CreatorBannerView` | 403 `banner_slot_not_granted`, 400 `validation_failed`·`link_url_invalid`, 404 `file_not_found`, 422 `link_domain_blocked`, 409 `banner_total_limit_reached`·`banner_limit_reached` |
| `PATCH /api/me/banners/{id}` | 크리에이터(부여됨) | `UpdateBannerRequest`(바뀐 필드만) | `CreatorBannerView` | 위와 같음 + 404 `banner_not_found` |
| `DELETE /api/me/banners/{id}` | 크리에이터(부여됨) | — | 204 | 403 `banner_slot_not_granted`, 404 `banner_not_found` |
| `PUT /api/me/banners/order` | 크리에이터(부여됨) | `ReorderRequest { ids }`(그 랜딩 배너 전체) | `CreatorBannerView[]` | 403, 400 `order_mismatch` |
| `GET /api/admin/ad-banners` | 운영자 | — | `AdBannerListResponse { items, counts }`(전체, 순서대로) | 기존 401·403 |
| `POST /api/admin/ad-banners` | 운영자 | `AdBannerRequest` | 201 `AdBannerView`(맨 뒤 순서) | 400 `validation_failed`·`link_url_invalid`·`banner_period_invalid`, 404 `file_not_found`, 422 `link_domain_blocked` |
| `PATCH /api/admin/ad-banners/{id}` | 운영자 | `UpdateAdBannerRequest`(바뀐 필드만) | `AdBannerView` | 위와 같음 + 404 `ad_banner_not_found` |
| `PUT /api/admin/ad-banners/{id}/end` | 운영자 | — | `AdBannerView`(끝남, 멱등) | 404 `ad_banner_not_found` |
| `PUT /api/admin/ad-banners/order` | 운영자 | `ReorderRequest { ids }`(전체 크리링 배너) | `AdBannerView[]`(새 순서) | 400 `order_mismatch` |
| `PUT /api/admin/creators/{userId}/banner-slot` | 운영자 | `SetBannerSlotRequest { granted }` | `OperatorCreatorDetail` | 400 `validation_failed`, 404 `creator_not_found` |
| `PUT /api/admin/banners/{id}/block` | 운영자 | `SetLinkBlockRequest { blocked, reason? }`(같은 모양) | `CreatorBannerView` | 400, 404 `banner_not_found` |
| `GET /api/admin/creators/{userId}` | 운영자 | 기존 | `OperatorCreatorDetail` + `bannerSlot`·`banners`·`bannerLimits` | 기존과 같음 |
| `GET /api/admin/creators/{userId}/stats` | 운영자 | 기존 | `OperatorCreatorStats` + `bannerClicks`([미정 4](#미정)) | 기존과 같음 |
| `GET {SHORT}/a/{bannerPublicId}/{landingPublicId}` | 누구나 | — | 302 저장된 URL | 302 `/notice?reason=link_unavailable` |
| `GET {SHORT}/b/{bannerPublicId}` | 누구나 | — | 302 저장된 URL | 302 `/notice?reason=link_unavailable` |

### 공유 타입 초안

```ts
export type BannerSlotKind = 'ad' | 'creator';

/** 공개 랜딩·미리보기의 배너 한 장. id: 공개 응답은 배너 공개 ID, 미리보기의 크리에이터 배너는 CreatorBannerView.id(uuid). */
export interface PublicBannerView {
  id: string;
  imageUrl: string;
  /** 움직이는 배너의 첫 장면 정지 이미지(3:1). 움직이지 않으면 null(미정 1). */
  stillImageUrl: string | null;
  alt: string;
  /** 공개 API: 광고는 passAccepted일 때 {SHORT}/a/…, 아니면 저장된 URL. 크리에이터 배너는 {SHORT}/b/…. 연결 URL이 없으면 null. 미리보기는 저장된 URL. */
  clickUrl: string | null;
}

export interface PublicBannerSlotView {
  kind: BannerSlotKind;
  /** 이 구역의 보이는 링크 중 슬롯 앞에 오는 수(0 = 맨 앞). */
  afterLinkCount: number;
  /** 1장 이상. */
  banners: PublicBannerView[];
}

export interface PublicBlockView {
  type: 'list';
  links: PublicLinkView[];
  /** 숨김 조건이면 null(R20 ⑥, R21 ③). 첫 list 구역에만 붙습니다. */
  slot: PublicBannerSlotView | null;
}

export interface BannerLimits { visibleMax: number; visibleUsed: number; totalMax: number; totalUsed: number }

export interface CreatorBannerView {
  id: string; // uuid
  image: ImageRef;
  stillImage: ImageRef | null;
  alt: string;
  url: string | null;
  hidden: boolean;
  blocked: boolean;
  blockedReason: string | null;
  position: number;
}

export interface CreatorLandingState {
  // 기존 필드 …
  slot: { kind: BannerSlotKind; slotIndex: number | null; grantedAt: string | null };
  /** 게시 중 크리링 배너(미리보기용, clickUrl = 저장된 URL). */
  adBanners: PublicBannerView[];
  /** 이 랜딩의 크리에이터 배너 전체(숨김·차단 포함, 순서대로). 회수 뒤에도 보관분이 들어 있고, 웹은 kind = 'creator'일 때만 씁니다. */
  banners: CreatorBannerView[];
  bannerLimits: BannerLimits;
}

/** slotIndex: 숨김·차단 포함 전체 순서에서 슬롯 앞 링크 수. n 이상이면 맨 뒤. 생략하면 지금 상대 위치 유지(옛 웹 호환). */
export interface LinkOrderRequest { ids: string[]; slotIndex?: number }

/** 미정 1이 B·C일 때 animated 추가. */
export interface UploadFileResponse extends ImageRef { animated: boolean }

export interface CreateBannerRequest {
  imageFileId: string;
  /** 이미지가 움직이면 필수, 아니면 null(미정 1이 A·D면 없음). */
  stillImageFileId?: string | null;
  alt: string;
  url?: string | null;
  hidden?: boolean;
}
/** 바뀐 필드만 보냅니다. imageFileId를 바꾸면 stillImageFileId도 같은 요청에 넣습니다. */
export type UpdateBannerRequest = Partial<CreateBannerRequest>;

export type AdBannerStatus = 'live' | 'scheduled' | 'ended';
export interface AdBannerView {
  id: string; image: ImageRef; stillImage: ImageRef | null; alt: string; url: string;
  startsAt: string; endsAt: string | null; status: AdBannerStatus;
  /** 게시 시작부터의 누적(결정 6). */
  impressions: number; clicks: number; createdAt: string;
}
export interface AdBannerListResponse { items: AdBannerView[]; counts: { all: number; live: number; scheduled: number; ended: number } }
export interface AdBannerRequest { imageFileId: string; stillImageFileId?: string | null; alt: string; url: string; startsAt: string; endsAt?: string | null }
/** 바뀐 필드만 보냅니다. */
export type UpdateAdBannerRequest = Partial<AdBannerRequest>;

export interface SetBannerSlotRequest { granted: boolean }

export interface OperatorCreatorDetail extends OperatorCreatorSummary {
  // 기존 필드 …
  bannerSlot: { grantedAt: string | null };
  banners: CreatorBannerView[];
  bannerLimits: BannerLimits;
}

export type BannerSlotHiddenReason = 'no_banners' | 'no_content';

/** 슬롯 배치·숨김 규칙. 공개 API와 toLandingPreview가 함께 씁니다. */
export function resolveBannerSlot<B>(input: {
  granted: boolean;
  /** 숨김·차단 포함 전체 순서에서 슬롯 앞 링크 수. null = 맨 뒤. */
  slotIndex: number | null;
  /** 전체 순서의 링크마다 방문자에게 보이는지. */
  linkVisible: readonly boolean[];
  hasPortfolio: boolean;
  /** 게시 중 크리링 배너(순서대로). */
  adBanners: readonly B[];
  /** 보이는(숨김·차단 아님) 크리에이터 배너(순서대로). */
  creatorBanners: readonly B[];
}): { kind: BannerSlotKind; afterLinkCount: number; banners: B[]; hidden: BannerSlotHiddenReason | null };
```

`resolveBannerSlot` 규칙은 다음과 같습니다.

- `kind = granted ? 'creator' : 'ad'`, `banners`는 그 종류의 목록입니다.
- `afterLinkCount`는 `linkVisible` 앞쪽 `min(slotIndex ?? ∞, n)`개 가운데 true인 수입니다.
- `hidden`은 다음 순서로 정합니다.
  - `kind = 'ad'`이고 보이는 링크 0개·포트폴리오 0개면 `'no_content'`입니다(R20 ⑥, 결정 7).
  - 그렇지 않고 배너 목록이 비면 `'no_banners'`입니다.
  - 그 밖에는 null입니다.
- 공개 API는 `hidden !== null`이면 `slot: null`로 바꿉니다.
- 관리 미리보기의 점선 자리는 `'no_banners'`일 때만 그 위치에 그립니다. `'no_content'`면 빈 랜딩 그대로 둡니다(handoff `숨김` 표).
- 미리보기의 `linkVisible`은 저장하지 않은 새 링크 초안을 맨 끝에 붙인 목록으로 만듭니다(슬롯이 null이면 초안도 슬롯 앞).

단위 테스트는 `packages/shared`에 `"test": "node --test 'src/**/*.spec.ts'"`를 더해 둡니다(웹 `node --test` 선례). spec 파일은 shared `tsconfig` 빌드에서 뺍니다. 루트 `pnpm test`가 `-r --if-present`로 함께 돌립니다. 표의 칸(종류 × 링크·포트폴리오 유무 × 배너 유무 × 위치 3가지 × 앞 링크 숨김)마다 `hidden`과 `afterLinkCount`를 확인합니다.

### 상수·경로·오류 코드

- 상수
  - `CRELINK_LIMITS.bannerAltMax: 100`
  - `BANNER_ASPECT_RATIO = { width: 3, height: 1 }`: 공개 랜딩·관리 미리보기·운영자 미리보기·정지 이미지 자르기가 같은 값을 씁니다(결정 1).
  - `BANNER_STILL_SIZE = { width: 1200, height: 400 }`: 정지 이미지 최대 크기(미정 1).
  - 업로드 한도 `imageMaxBytes`(4MB)와 허용 형식 `ALLOWED_IMAGE_TYPES`(GIF 포함)는 그대로입니다.
  - 배너 이미지 최소 크기는 막지 않습니다(기술 검토 A4).
- 한도 n과 보관 상한은 공유 상수가 아니라 API 설정값입니다. 웹은 응답의 `bannerLimits`만 씁니다.
- `CRELINK_API_PATHS`: `meBanners`, `meBanner(id)`, `meBannersOrder`, `adminAdBanners`, `adminAdBanner(id)`, `adminAdBannerEnd(id)`, `adminAdBannersOrder`, `adminCreatorBannerSlot(userId)`, `adminBannerBlock(bannerId)`.
- 새 오류 코드와 웹 문구(handoff 문구 기준). 웹 `errors.ts`의 고정 문구는 `{n}` 없이 둡니다. 배너 패널은 task 안에서 `BrowserApiError.code`를 보고 두 가지를 직접 처리합니다. 한도 코드는 `bannerLimits`로 n을 넣은 문장을 만들고, `banner_slot_not_granted`는 회수 흐름(상태 다시 읽기)을 탑니다. 지금 `useAction`은 코드를 버리기 때문입니다.

| 코드 | 상태 | 웹 문구 |
| --- | --- | --- |
| `banner_not_found` | 404 | `배너를 찾을 수 없어요. 새로고침해 주세요.` |
| `banner_limit_reached` | 409 | 고정: `보이는 배너 한도에 닿았어요.` / 패널: `보이는 배너는 {n}장까지예요. 다른 배너를 숨기면 이 배너를 보이게 할 수 있어요.` |
| `banner_total_limit_reached` | 409 | 고정: `배너 보관 한도에 닿았어요.` / 패널: `배너는 숨긴 것까지 {m}장까지 둘 수 있어요. 쓰지 않는 배너를 지워 주세요.` |
| `banner_slot_not_granted` | 403 | `배너 슬롯이 회수되어 이 자리에 다시 크리링 광고 블록이 나와요.` → 상태 다시 읽기 |
| `ad_banner_not_found` | 404 | `광고 배너를 찾을 수 없어요. 새로고침해 주세요.` |
| `banner_period_invalid` | 400 | `게시 끝은 시작보다 뒤여야 해요.` |

- 다시 쓰는 코드
  - `link_url_invalid`, `link_domain_blocked`: 웹 문구가 handoff와 같습니다.
  - `order_mismatch`, `file_not_found`
  - `file_type_unsupported`·`file_too_large`: 업로드 경로 그대로입니다.
  - `validation_failed`: 이미지·대체 문구가 없을 때, 날짜 형식이 틀렸을 때, 움직이는 이미지에 정지 이미지가 없거나 정지 이미지가 움직일 때.
- 날짜
  - `startsAt`·`endsAt`는 시간대가 붙은 ISO 8601이어야 하고, 시간대가 없으면 400 `validation_failed`입니다.
  - 웹은 `datetime-local` 값에 Asia/Seoul(`+09:00`)을 붙여 보내고, 수정할 때는 반대로 바꿔 채웁니다.
  - 과거 시작은 받습니다(바로 게시).
  - 입력 검증은 `endsAt > startsAt`(400 `banner_period_invalid`)입니다. DB CHECK는 예약 배너를 내릴 때 둘이 같아질 수 있어 `>=`입니다.

### 서버 규칙

- 크리에이터 배너 쓰기는 같은 트랜잭션에서 사용자 잠금(`SELECT … FROM users … FOR UPDATE`) → 부여 확인(`banner_slot_granted_at`) → 배너 소유 확인 → 한도 순서로 합니다. 그래야 회수(UPDATE users)와 순서가 맞습니다. 부여되지 않았으면 403 `banner_slot_not_granted`(보관 배너를 고치는 길 없음).
- 한도: 보이는 배너는 숨김도 차단도 아닌 배너입니다. 만들 때는 보관 상한을 먼저 검사합니다. n은 새 배너나 숨김 해제가 보이는 배너를 늘릴 때만 검사합니다. 설정값을 지금 장수보다 낮추면 있는 배너는 그대로 두고 추가·숨김 해제만 막습니다.
- 차단 배너는 수정·삭제·숨김 전환이 됩니다. 주소를 바꿔도 `blocked_at`은 그대로입니다(R21 ④, 링크 `update`와 같음). 크리에이터 배너의 POST와 url을 바꾸는 PATCH는 `CreatorService.blockedDomainFor`로 검사해 422 `link_domain_blocked`를 줍니다.
- 크리링 배너의 POST, 그리고 결과가 게시 중·예약인 PATCH는 저장된(또는 새) host를 같은 함수로 검사합니다. 그래서 차단 도메인으로 내려간 배너를 기간만 고쳐 다시 여는 길이 없습니다.
- 이미지 소유
  - 크리에이터 배너의 새 파일은 본인이 올린 것이어야 합니다(`FilesService.ownedFileId`).
  - 크리링 배너는 저장된 값과 같은 파일 id면 검사를 건너뜁니다. 새 파일은 운영자(`users.role = 'operator'`)가 올린 것이어야 합니다. 운영자 여럿이 함께 관리하기 때문입니다.
  - 운영자도 `POST /api/me/files`로 올립니다.
- 정지 이미지(미정 1이 B·C)
  - 이미지가 움직이면(`files.animated`, NULL이면 저장 때 `FileStorage.get`으로 판정해 채움) `stillImageFileId`가 필요합니다. 정지 이미지 자신은 움직이지 않아야 합니다.
  - PATCH에서 `imageFileId`를 바꾸면 `stillImageFileId`도 같은 요청에 넣어야 합니다(움직이지 않으면 null). `stillImageFileId`만 바꾸는 것은 지금 이미지가 움직일 때만 받습니다. 어기면 400 `validation_failed`.
- 움직임 판정(업로드 때, 새 의존성 없음)
  - GIF: 이미지 서술자가 2개 이상이면 움직임.
  - WebP: `VP8X` 애니메이션 플래그 또는 `ANIM` 청크.
  - PNG: `IDAT` 앞 `acTL` 청크.
  - 세 형식 모두 단위 테스트로 확인합니다.
- 크리링 배너 상태(같은 `now()`, 목록의 items와 counts는 한 문장에서 계산)
  - live: `starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`
  - scheduled: `starts_at > now()`
  - ended: `ends_at <= now()`
- 크리링 배너 내리기(`…/end`)
  - `ends_at = least(coalesce(ends_at, now()), now())`로 끝냅니다. 예약 배너면 `starts_at = least(starts_at, now())`도 함께 바꿔 CHECK를 지킵니다.
  - 이미 끝난 배너는 바꾸지 않고 200을 줍니다(멱등).
  - 끝난 배너는 `PATCH`로 기간을 다시 열 수 있습니다(위 차단 검사를 거침).
- 크리링 배너 등록·정렬·내리기는 트랜잭션 advisory lock(`pg_advisory_xact_lock(<상수>)`, 보존 작업과 같은 방식)으로 줄 세웁니다.
  - 정렬은 잠금을 잡은 뒤 전체 id를 검사(`order_mismatch`)하고 0..n-1로 다시 매깁니다.
  - 새 배너는 `coalesce(max(sort_order) + 1, 0)`입니다.
  - 방문자에게는 게시 중인 것만 `ORDER BY sort_order, created_at`으로 보냅니다.
- 슬롯 부여: `banner_slot_granted_at = CASE WHEN granted THEN coalesce(banner_slot_granted_at, now()) END`.
- 차단 도메인 추가(`addBlockedDomain`)는 같은 트랜잭션에서 배너도 처리합니다.
  - `creator_banners`: 링크와 같은 호스트 조건으로 `blocked_at = now()`, `blocked_reason = 사유 또는 '차단 도메인: …'`.
  - `ad_banners`: 게시 중·예약이고 호스트가 걸리면 내리기와 같게 끝냅니다([미정 3](#미정)).
  - 차단 도메인을 목록에서 지워도 이미 차단된 배너는 운영자가 배너마다 풉니다(링크와 같음).
- 공개 랜딩 질의
  - `banner_slot_granted_at`은 `publicLanding`의 users JOIN에, `slot_position`은 구역 질의에 더합니다(새 질의 없음).
  - 링크 질의는 숨김·차단 열을 더해 모든 행을 가져오고 서버에서 거릅니다(`linkVisible` 계산).
  - 배너 질의는 1개만 둡니다.
- 합계 숫자: `sum(...)`은 `::int`로 바꿔 JSON number로 보냅니다. node-pg는 bigint를 문자열로 주고, 이 저장소에는 int8 파서 설정이 없습니다(기존 `count(*)::int` 관례).

### 설정값

| 키 | 처음 값 | 규칙 |
| --- | --- | --- |
| `BANNER_SLOT_MAX` | 5 | 보이는 배너 상한(R21 ②, 결정 2). 비면 5, 1 이상 정수가 아니면 기동 거부. `[임시값]` |
| `BANNER_SLOT_TOTAL_MAX` | 20 | 숨김 포함 보관 상한. 비면 20, `BANNER_SLOT_MAX` 이상 정수가 아니면 기동 거부. `[임시값]` |

`AppConfig`(`apps/api/src/config.service.ts`)에 읽기를 두고, `onModuleInit`에서 검사합니다. 키 목록 원본 `apps/api/.env.example`과 `apps/api/docs/README.md#환경변수`에 적습니다. 기본값이 있으므로 운영 env 파일(`infra/prod/secrets/*.sops.env`)은 이번 에픽에서 바꾸지 않습니다. 나중에 운영 값을 바꿀 때는 비밀이 아니므로 먼저 `.sops.yaml` `unencrypted_regex`에 키를 더하고 다시 암호화합니다. 그다음 `sops set`으로 넣습니다(`DATABASE_POOL_MAX`와 같은 절차, `infra/docs/prod-runbook.md`). 잘못된 값이면 새 색이 기동하지 못하고 배포만 실패합니다(활성 색 유지).

## 노출·클릭 기록과 R7 ⑥

### 노출 `[AI 제안]`: 서버·`passAccepted`·첫 장

공개 랜딩 API는 `passAccepted === true`이고 `slot.kind = 'ad'`일 때 첫 장 배너 1건을 백그라운드로 올립니다. upsert 도우미 `recordAdStat(kind: 'impression' | 'click', …)`은 `TrackingService`에 두고, 예정 T2가 만들고 T7이 씁니다.

```sql
INSERT INTO ad_banner_daily_stats (day, ad_banner_id, landing_public_id, impressions)
VALUES ((now() AT TIME ZONE 'Asia/Seoul')::date, $1, $2, 1)
ON CONFLICT (ad_banner_id, day, landing_public_id)
DO UPDATE SET impressions = ad_banner_daily_stats.impressions + 1
```

- R7 ⑥: 서비스 화면에서 연 랜딩은 같은 출처 요청이라 통과 표시가 없습니다(`apps/web/src/app/(public)/p/[publicId]/page.tsx`). 관리 미리보기는 공개 API를 부르지 않습니다. 그래서 따로 막는 코드가 필요 없습니다.
- 웹은 메타데이터와 화면이 같은 요청 안에서 한 번만 조회합니다(`cache`). 그래서 한 번 그릴 때 한 번 셉니다. 새로고침하면 통과 표시가 지워진 주소라 단축 주소를 다시 거치고, 방문처럼 한 번 더 셉니다.
- 한계는 넷입니다.
  - 웹 서버가 부르므로 방문자 쿠키·IP가 없고, 수만 남습니다.
  - 화면에 그린 것을 셉니다. 화면 아래라 보지 못한 경우도 세고, 넘겨 본 둘째 장 이후는 세지 않습니다.
  - 메신저 미리보기 봇도 셉니다(방문과 같음).
  - 통과 표시는 60초 안에서 다시 쓸 수 있어, 그 안에 같은 주소를 다시 요청해도 셉니다.
- 운영자 화면 도움말(`노출은 방문자가 랜딩을 열었을 때 첫 장 기준으로 세요. 크리링 안에서 연 화면은 세지 않아요.`)이 이 기준입니다.
- 비교한 안은 비콘(장마다 실제로 본 것)입니다. BFF 공개 POST, 통과 표시와 묶은 서명 노출 토큰, 본 도메인 방문자 쿠키, 남용 방지가 모두 필요해 비용이 큽니다. 외부 광고주에게 CPM으로 팔 때 다시 봅니다.

### 클릭

- 광고: `GET {SHORT}/a/{bannerPublicId}/{landingPublicId}`가 같은 행에 `clicks + 1`을 upsert합니다. 크리링 배너는 모든 랜딩이 함께 쓰므로, 랜딩을 주소에 넣어야 랜딩·배너별로 기록됩니다. 쿠키·IP는 남기지 않습니다.
- R20 ⑧의 "서비스 화면 클릭 제외": 공개 API는 `passAccepted`일 때만 `/a/` 주소를 주고, 아니면 저장된 URL을 줍니다. 대가로, 같은 출처에서 다시 그린 경우(예: 로그인하고 돌아온 방문자)의 클릭은 세지 않습니다.
- 크리에이터 배너: `GET {SHORT}/b/{bannerPublicId}`가 `creator_banner_clicks` 원본을 남깁니다(링크 클릭과 같은 항목). R21 ④가 "외부 링크 클릭처럼"이므로, 공개 API는 링크 `/c/`처럼 늘 기록 주소를 줍니다. 서비스 화면에서 연 랜딩의 링크 클릭이 세어지는 지금 차이도 같습니다(범위 밖).
- 위조: 누구나 `/a/` 주소를 만들어 수를 늘릴 수 있습니다(링크 `/c/`와 같은 수준). 지금은 내부 참고용이라 받아들입니다. 외부 광고를 팔 때 무효 트래픽 처리를 다시 봅니다(PRD 위험).
- 지표: `crelink.ad_banner.impression`, `crelink.ad_banner.click`, `crelink.creator_banner.click`(`countBusinessMetric`, `monitoring/metrics.ts`). `apps/api/docs/README.md` 지표 표에 더합니다.

### 운영자 표 누적 집계(결정 6)

```sql
SELECT b.*, coalesce(s.impressions, 0) AS impressions, coalesce(s.clicks, 0) AS clicks,
       CASE WHEN b.starts_at > now() THEN 'scheduled'
            WHEN b.ends_at IS NOT NULL AND b.ends_at <= now() THEN 'ended'
            ELSE 'live' END AS status
FROM ad_banners b
LEFT JOIN (
  SELECT ad_banner_id, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks
  FROM ad_banner_daily_stats GROUP BY ad_banner_id
) s ON s.ad_banner_id = b.id
ORDER BY b.sort_order, b.created_at
```

- 노출·클릭은 게시 중에만 쌓이므로 합계가 곧 "게시 시작부터의 누적"입니다. 끝난 배너를 다시 열면 이어서 더합니다.
- `counts`는 같은 결과에서 셉니다. 웹은 `status=all` 목록을 한 번 받아 `item.status`로 걸러 봅니다. 그래서 API에 `?status=` 걸러보기가 없습니다. 순서도 `전체`에서만 바꿉니다.
- 크리링 배너는 수십 장 이내로 보고 페이지를 나누지 않습니다. 행 수는 배너 × 랜딩 × 날짜로 늘어납니다. 목록 응답이 느려지면(p95 300ms 초과) 배너·날짜 단위 집계 테이블을 더합니다. `[임시값]`

### 보존(R11)

- `creator_banner_clicks`는 보존 작업(`apps/api/src/retention/retention.service.ts` `runOnce`)이 처리합니다. 365일보다 오래된 원본을 `creator_banner_click_rollups`로 옮기고, 같은 트랜잭션에서 지웁니다. `visit_daily_rollups.link_clicks`에는 섞지 않습니다.
- `ad_banner_daily_stats`는 개인 식별 정보가 없는 집계라 계속 보관합니다.
- 운영자 통계(`OperatorCreatorStats`)에 `bannerClicks`를 더합니다. 모양은 `Array<{ bannerId: string; alt: string | null; clicks: number }>`입니다. 원본과 집계를 합치고, `bannerId`는 공개 ID이며, 지운 배너는 `alt: null`입니다. `totals.linkClicks`·`daily`에는 넣지 않습니다. 화면에 보여 줄지는 [미정 4](#미정)입니다.

## 화면 상태와 API 대응

앱(Expo)은 이번 범위가 아닙니다(R16 웹만). 문구·모양은 handoff가 기준입니다.

### 공개 랜딩

| 화면 상태 | 조건(API 응답) | 웹 |
| --- | --- | --- |
| 광고 블록 | `slot.kind = 'ad'` | 링크 목록 `ul` 안 `afterLinkCount` 자리의 `li`에 `BannerCarousel`을 둡니다(`광고` 배지, 영역 `크리링 광고`). 링크가 0개이고 포트폴리오만 있으면 링크 목록 자리에 광고 블록만 둡니다. |
| 배너 슬롯 | `slot.kind = 'creator'` | 같은 자리에 배지 없이 둡니다. 영역 이름은 `<표시 이름> 배너`(없으면 `크리에이터 배너`)이고, 1장이면 조작 줄이 없습니다. 빈 랜딩에서도 보입니다(결정 7). |
| 링크 목록·빈 랜딩 판정 | 보이는 링크 수, `slot` | `ul`은 보이는 링크가 1개 이상이거나 `slot ≠ null`일 때 그립니다. `hasLinkContent`에 `slot`을 넣습니다. 슬롯만 있는 랜딩은 빈 랜딩이 아니므로 `아직 준비 중인 페이지예요.`·`아직 올린 링크가 없어요.`를 보이지 않습니다. `block.slot`이 없거나 null이면 그리지 않습니다. |
| 숨김 | `slot = null` | 자리가 없습니다. |
| 여러 장 | `banners.length ≥ 2` | 위치 `n / m`, 이전·다음 버튼, ←/→(`preventDefault` + `scrollTo`), `aria-live` 안내를 둡니다. 자동으로 넘기지 않고, 보이지 않는 장은 `inert`입니다. 끝 버튼이 비활성이 될 때 그 버튼에 초점이 있었으면 반대 버튼으로 옮깁니다. ←/→로 넘긴 뒤에는 초점을 새 장의 링크로 옮깁니다(링크가 없으면 영역으로). 지금 장은 `IntersectionObserver`나 스크롤 디바운스로 계산합니다(`scrollend` 없는 iOS WKWebView). |
| 누르기 | `clickUrl` 있음/null | 있으면 이미지 전체가 링크입니다(같은 창). null이면 누를 수 없는 이미지입니다. |
| 움직이는 배너 | `stillImageUrl` 있음 | `<picture><source media="(prefers-reduced-motion: reduce)" srcset=정지>`로 정지 이미지를 고릅니다. 그 밖에는 원본을 보여 주고 `움직임 멈추기`/`다시 재생` 버튼을 둡니다(미정 1 C, 정지 이미지로 바꿈). 버튼 표시는 CSS 미디어로만 정해 SSR과 첫 그림을 맞춥니다. |
| 이미지 실패 | 해당 장 로드 실패 | 그 장을 건너뜁니다. 마운트 때 `complete && naturalWidth === 0`도 확인합니다. 남은 장이 0이면 블록을 숨깁니다. 첫 장 말고는 `loading="lazy"`입니다. |
| 방명록 탭 | `guestbookEnabled` | `링크` 탭 안에만 둡니다. |

`BannerCarousel`만 `'use client'`이고, `Landing`은 서버·클라이언트 공용 그대로입니다. 캐러셀은 장 내용을 children(`ReactNode[]`)으로 받습니다. `Landing`이 장마다 `<a>`, 고르기 버튼, 그냥 이미지 중 무엇을 그릴지 정합니다. 서버 구성 요소에서 함수형 render prop은 넘길 수 없기 때문입니다.

### 페이지 편집

`LandingEditTarget`에 `ad-slot`·`banner-slot`·`banner(id | null)`을 더하고, `targetKey`(`banner:<id|new>`)와 `sectionOfKey`를 맞춥니다.

| 화면 상태 | 조건(API 응답) | 웹 |
| --- | --- | --- |
| 미리보기 광고 블록 | `resolveBannerSlot` 결과 `kind = 'ad'` | `EditRegion` 방식으로 감쌉니다. 이름표 꼬리는 `· 위치 이동`으로 바꿀 수 있게 합니다. 이전·다음은 동작합니다. edit 모드에서는 `<a>`를 그리지 않고 링크 없는 이미지를 그립니다(지금 `landing-edit.ts` 규칙). |
| 미리보기 배너 슬롯 | `kind = 'creator'` | 영역은 `EditRegion`(`배너 슬롯 · 편집`, → 배너 슬롯 패널)입니다. 장마다 `EditItem`(→ `배너 · <대체 문구>` 폼)을 둡니다. 장별 이름표는 가로 스크롤 트랙에 잘리지 않게 트랙 밖에 둡니다. |
| 미리보기 점선 자리 | `hidden = 'no_banners'` | 그 위치에 handoff 문구의 점선 자리를 둡니다. 배너 슬롯은 누르면 패널로 갑니다. `'no_content'`면 그리지 않습니다. |
| 처음 패널 구역 목록 | `slot` | 외부 링크 다음 줄에 둡니다. 광고 블록이면 `광고 블록`(보조 줄 `링크 목록 맨 뒤`·`링크 목록 맨 앞`·`n번째 링크 다음`)입니다. 배너 슬롯이면 `배너 슬롯`(`보이는 배너 a/n장 · 전체 b장`)입니다. 초안이 있으면 `저장 안 함`을 붙입니다. |
| 1023px 이하 | 같음 | `광고 블록 · 위치`/`배너 슬롯 · 편집` 칩을 둡니다. 누르면 하단 시트가 열리고, 아래에 `저장`·`삭제`를 고정합니다. |
| 외부 링크 패널 | `links`, `slot.slotIndex` | 광고 행/배너 슬롯 행을 링크 사이에 섞어 dnd-kit으로 정렬합니다(화면 전용 특수 id). 무엇을 끌든 `PUT /api/me/links/order { ids, slotIndex }`를 보내고, 실패하면 되돌립니다. 안내 문장은 종류별 이름을 쓰고, `k번째`·`전체 n개`는 섞인 목록 기준입니다. 링크가 0개면 행 하나만 두고 손잡이는 `aria-disabled`입니다. 한도 배지는 이 행을 세지 않습니다. |
| 광고 블록 패널 | `kind = 'ad'` | 안내, 지금 위치, `외부 링크 목록에서 끌어 옮기기`를 둡니다. 이 버튼은 외부 링크 패널을 열고 초점을 광고 행 손잡이로 옮깁니다(지금 패널 제목으로 가는 초점 규칙의 예외). 게시 0장이면 그 문장도 둡니다. |
| 배너 슬롯 패널 | `kind = 'creator'`, `banners`, `bannerLimits` | 배지 `보이는 배너 a/n장`·`숨긴 배너 포함 전체 b/m장`을 둡니다. 행은 썸네일 96×32·대체 문구·도메인 또는 `연결 없음`·스위치·`수정`입니다. 숨긴 배너는 흐리게, 차단 배너는 배지·사유와 잠긴 스위치로 보입니다. 정렬은 `PUT /api/me/banners/order`입니다. 보이는 배너가 0장이면 `보이는 배너가 없어 방문자 화면에서 배너 슬롯이 보이지 않아요.`를 보입니다. |
| 배너 폼 | `POST`·`PATCH /api/me/banners…` | 필수 항목을 검사합니다. 저장 중에는 입력을 잠그고, 오류는 위 표의 문구를 씁니다. `삭제`는 확인(`이 배너를 지울까요? 지운 배너는 되돌릴 수 없어요.`)을 거칩니다. 움직이는 이미지는 정지 이미지를 만들어 함께 올립니다(아래). |
| 배너 초안 | `LandingDrafts.banners` | 아래 [배너 초안 규칙](#배너-초안-규칙)을 따릅니다. |
| 한도 | 409 `banner_limit_reached`·`banner_total_limit_reached` | 추가를 막고, 스위치를 되돌리고, 안내 문구를 보입니다. |
| 편집 중 회수 | 403 `banner_slot_not_granted` 또는 다시 읽은 `slot.kind = 'ad'` | 안내 문구를 보이고 상태를 다시 읽은 뒤 처음 구역 목록으로 돌아갑니다. 배너 초안은 모두 버립니다. |
| 로딩·저장 실패 | 기존 | 0056 뼈대에 3:1 회색 면을 더합니다. 실패하면 오류 줄과 `다시 시도`를 보입니다. |

### 배너 초안 규칙

- 형식: `BannerDraft { id: string | null; image: ImageRef | null; stillImage: ImageRef | null; alt: string; url: string }`. 열쇠는 `draftKey(id)`이고, `ManagerDirty.banner`·`dirtyKeys`·`useHasDraft`에 더합니다.
- `toLandingPreview`는 저장된 배너를 제자리에서 바꿔 그립니다. 숨김·차단 배너는 그대로 뺍니다.
- 새 배너는 이미지가 있을 때만 맨 끝에 붙고 `creatorBanners`에 들어갑니다. 그래서 보이는 배너 0장이던 슬롯도 미리보기에 나타납니다.
- 슬롯이 회수되면 배너 초안을 모두 버립니다.

### 정지 이미지 만들기(미정 1이 B·C)

1. 원본을 `POST /api/me/files`로 올립니다.
2. 응답이 `animated: true`이면 사용자가 고른 로컬 `File`에서 첫 장면을 얻습니다(`createImageBitmap(file)`, 되면 `ImageDecoder`). 올린 주소에서 다시 받지 않습니다.
3. 첫 장면을 가운데 기준 3:1로 잘라 최대 1200×400 PNG로 만들고 올립니다. 원시 크기가 약 1.9MB 이하라 4MB 한도를 늘 지키고, 투명도도 남습니다. 비율 상수를 바꾸면 다시 만들어야 합니다.
4. 두 결과를 한 쌍으로 폼에 넘깁니다. 두 번째 업로드가 실패하면 쌍 전체를 실패로 보고 기존 이미지 오류 줄을 씁니다.

이 도우미는 `ImageField` 확장(3:1 미리보기·안내 문구 prop)으로 관리 화면과 운영자 화면이 함께 씁니다.

### 운영자

| 화면 상태 | 조건(API 응답) | 웹 |
| --- | --- | --- |
| 광고 배너 목록 | `AdBannerListResponse`(서버 렌더) | 1280px은 표(손잡이·썸네일 120×40·대체 문구·URL·기간·상태·노출·클릭·행동)이고, 700px 이하는 카드입니다. `useWideLayout`으로 하나만 그려 dnd-kit id가 겹치지 않게 합니다. 걸러보기 `전체 n · 게시 중 n · 예약 n · 끝남 n`은 `counts`를 쓰고 `item.status`로 거릅니다. 손잡이는 `전체`에서만 보입니다. |
| 경고·빈·로딩·오류 | `counts.live = 0`, `counts.all = 0`, 요청 중, 실패 | 게시 0장 경고 줄, `등록한 광고 배너가 없어요.`, `/admin/ad-banners/loading.tsx` 뼈대 3행을 둡니다. 실패하면 `광고 배너를 불러오지 못했어요.` + `다시 시도`를 보입니다. 지금 `AdminShell` 오류는 문구가 고정이라 화면별 제목·다시 읽기 prop을 더합니다. |
| 등록·수정 | `POST`·`PATCH` | 대화상자(700px 이하는 하단 시트)입니다. 이미지·대체 문구·URL·시작이 필수이고 끝은 선택입니다. `방문자에게 이렇게 보여요` 미리보기는 `BannerCarousel`을 씁니다. 오류는 `banner_period_invalid`, 차단 도메인, 저장 실패입니다. 바꾼 뒤에는 `router.refresh()`입니다. |
| 내리기·정렬 | `PUT …/end`, `PUT …/order` | 내리기는 확인 뒤 끝남으로 바뀝니다. 정렬은 끌기·키보드(즉시 저장, 실패하면 되돌림)이고, 안내 문장은 `<대체 문구> 배너를 3번째로 옮겼어요.`입니다. |
| 크리에이터 상세 | `bannerSlot`, `banners`, `bannerLimits` | `배너 슬롯` 묶음(없음·부여됨·회수 뒤 문장, 확인 대화)과 `배너` 카드를 둡니다. 카드는 보관분을 포함하고 `숨김`·`차단됨` 배지, 차단 사유와 `차단`/`차단 풀기`를 보입니다. 차단 조작은 지금 `LinkBlockControl`을 `{ blocked, blockedReason, path }`를 받는 공용 구성 요소로 넓혀 씁니다. 배너가 없으면 `만든 배너가 없어요.`입니다. |
| 통계 | `bannerClicks` | 링크별 클릭 아래 배너별 클릭 표를 둡니다(미정 4 A). |

## 권한·보안·개인정보

- 크리에이터 배너 쓰기는 `SessionGuard` 뒤 트랜잭션 안에서 부여를 확인합니다. 운영자 API는 `OperatorGuard`(401·403 `forbidden`)입니다. 웹 BFF는 상태 변경 요청의 같은 출처를 확인합니다(기존).
- BFF 허용 목록(`apps/web/src/app/api/backend/[...path]/route.ts`)에 더할 것
  - 크리에이터: `POST api/me/banners`, `PUT api/me/banners/order`, `PATCH·DELETE api/me/banners/{ID}`
  - 운영자: `POST api/admin/ad-banners`, `PUT api/admin/ad-banners/order`, `PATCH api/admin/ad-banners/{ID}`, `PUT api/admin/ad-banners/{ID}/end`, `PUT api/admin/banners/{ID}/block`
  - `PUT api/admin/creators/{ID}/banner-slot`: 기존 `(extra-slots|suspension)` 정규식을 넓힙니다.
  - `GET api/admin/ad-banners`는 서버 렌더만 부르므로 넣지 않습니다.
- 단축 도메인
  - Caddy(`infra/prod/Caddyfile`)의 단축 호스트에 `GET ^/a/[a-z0-9]{10}/[a-z0-9]{10}$`와 `GET ^/b/[a-z0-9]{10}$`를 API로 넘기는 matcher를 더합니다.
  - 단축 주소 matcher(`/` 없는 3~30자)와 API `@Get(':slug')`(한 세그먼트)와 겹치지 않습니다. 1~2자 `/a`·`/b`는 어느 쪽에도 맞지 않아 404입니다.
  - 같은 `reverse_proxy` 블록이 늘지 않도록, 정규식 하나를 교대로 묶거나 proxy 스니펫 하나로 둡니다(구현 판단, 기존 시험이 모두 통과해야 함).
  - API `SHORT_DOMAIN_ROUTES`에 `a/\:bannerPublicId/\:landingPublicId`, `b/\:bannerPublicId`를 더합니다(`:` 이스케이프 규칙 그대로). `apps/api/docs/README.md` 단축 도메인 절도 고칩니다.
  - 새 exclude가 `/api/*` 두 단계 경로의 접두사를 빼지 않는지 health 시험처럼 확인합니다.
- 열린 리디렉트: 두 클릭 경로 모두 DB에 저장된 URL로만 보냅니다.
- 개인정보 처리방침(`/privacy`)에 더할 것
  - 크리에이터 배너 클릭: 외부 링크 클릭과 같은 항목·목적, 1년 보관 뒤 집계.
  - 광고 배너 노출·클릭 수: 개인을 알아볼 수 있는 정보 없이 날짜·랜딩·배너별 수만, 계속 보관.
  - 광고 기록은 새 개인정보 항목이 아니지만 투명성을 위해 적습니다. 법률 검토 전입니다(PRD 위험).
- Sentry: 요청 본문을 보내지 않는 기존 규칙 그대로입니다. 대체 문구·URL은 로그에 남기지 않습니다.
- 파일: 배너 이미지는 기존 공개 이미지 경로(`GET /api/files/{id}`, 추측하기 어려운 UUID)로 나갑니다.

## 비기능 요구

- 성능
  - 공개 랜딩 API는 기존 병렬 질의에 배너 질의 하나만 더합니다(부여 여부·위치는 기존 질의에 열 추가). 노출 기록은 응답을 기다리지 않습니다.
  - 목표는 기존 대비 p95 증가 20ms 이내입니다. 운영 DB 풀 6(`DATABASE_POOL_MAX`)을 조건으로 잽니다. `[임시값]`
  - 이미지는 `RemoteImage`가 원본(최대 4MB)을 그대로 보내므로 첫 장만 즉시 불러오고 나머지는 `loading="lazy"`입니다.
  - 배너 용량 한도는 지금 4MB 그대로 둡니다(낮추면 GIF가 많이 막힘).
- 접근성
  - 영역은 `section` + `aria-roledescription="캐러셀"` + `aria-label`이고, 장마다 `role="group"` + `aria-label="2 / 3"`입니다.
  - `aria-live="polite"` 안내, 이전·다음 44px, ←/→, `inert`, 초점 링 3px을 둡니다. `prefers-reduced-motion`이면 부드러운 스크롤을 끕니다.
  - 초점 규칙은 위 표와 같습니다. 움직이는 배너 처리는 [미정 1](#미정)입니다.
- 플랫폼: React 19.2의 `inert`를 그대로 씁니다. iOS WKWebView의 `scrollend` 문제는 위에 적었습니다.
- 반응형(handoff 반응형 표)
  - 공개 랜딩: 390·1280·320px. 320px에서 조작 줄이 한 줄을 유지합니다.
  - 관리 화면: 390·1280px(1023 경계).
  - 운영자 화면: 390·700·1280px.
- 관측: 위 지표 3개를 두고, 기록 실패는 `TrackingService.inBackground` 로그로 남깁니다.

## 위험과 스파이크

| 질문 | 막는 티켓 | 스파이크 티켓 | 끝낼 조건 |
| --- | --- | --- | --- |
| 로컬 `File`에서 움직이는 GIF·WebP·APNG의 첫 장면을 얻을 수 있는가(`createImageBitmap`, `ImageDecoder`) | 예정 T12(미정 1이 B·C일 때) | 예정 S1 | Chrome·Firefox·Safari에서 세 형식의 첫 장면을 3:1로 잘라 1200×400 PNG(4MB 이하)로 만듭니다. Playwright WebKit은 iOS WKWebView가 아니므로 iOS 시뮬레이터나 기기에서도 봅니다. 없으면 "iOS 미확인"으로 남기고 WebKit 결과만으로 확정하지 않습니다. 결과는 S1 진행 기록에 남기고, orchestrator가 설계 `변경 기록`에 옮깁니다. 안 되면 서버 변환(새 의존성, ADR)으로 미정 1을 다시 올립니다. |
| 노출 카운터 upsert가 인기 랜딩에서 행 잠금 경합을 만드는가 | — | 없음(예정 T17 뒤 관찰) | 첫 주에 운영 지표 `crelink.ad_banner.impression`과 DB 잠금 대기를 확인합니다. 문제가 되면 메모리 묶음 쓰기로 바꿉니다. |
| 운영자 표 합계 질의가 쌓인 기록에서 느려지는가 | — | 없음 | p95가 300ms를 넘으면 배너·날짜 집계 테이블을 더합니다(위 `운영자 표 누적 집계`). |
| E2E 정리가 운영자 사용자를 지울 때 `ad_banners` 행 때문에 막힘 | 예정 T17 | 없음 | E2E fixture가 사용자를 지우기 전에 시험이 만든 `ad_banners`를 지웁니다. |
| Caddy와 API의 배포 순서 | 예정 T17 | 없음 | 아래 [통합과 배포 순서](#통합과-배포-순서). |

알려진 한계(받아들임): 렌더 기준 노출(보지 못한 경우 포함, 둘째 장 이후 미포함, 봇 포함), 같은 출처에서 다시 그린 랜딩의 광고 클릭 미기록, `/a/` 주소 위조 가능.

## 디자인 검토 의견

디자인 기술 검토는 0064에서 끝났고, 판정은 **통과(주의점 있음)**입니다. 의견 전문과 반영 결과(A1~A7)는 [handoff `기술 검토`](../../design/ad-banner-block/handoff.md#기술-검토)에 있습니다. 이 설계는 그 절의 `계약 가정 수정` 1~10과 `0065 설계로 넘길 항목`에서 출발했습니다. 구현 주의점 B1~B10은 다음과 같이 반영했습니다.

| 항목 | 반영 |
| --- | --- |
| B1 미리보기 광고 블록은 `EditRegion` 식, 이름표 꼬리 바꾸기 | `페이지 편집` 표, 예정 T11 |
| B2 캐러셀(`scrollend` 없음, ←/→ 기본 동작, `inert`, `'use client'`) | `공개 랜딩` 표·`비기능 요구`, 예정 T9 |
| B3 이미지 실패 건너뛰기, lazy, 용량 | `공개 랜딩` 표·`비기능 요구`, 예정 T9 |
| B4 dnd-kit 특수 id, 종류별 안내 문장 | `페이지 편집` 표, 예정 T10 |
| B5 단축 도메인 경로 | `권한·보안`, 예정 T7·T8 |
| B6 BFF 허용 목록 | `권한·보안`, 예정 T13~T16 |
| B7 운영자 이미지 삭제 규칙 | `ad_banners.image_file_id` RESTRICT, migration 테스트 |
| B8 차단 도메인 추가 시 배너 | `서버 규칙`, [미정 3](#미정) |
| B9 게시 기간 시간대 | `상수·경로·오류 코드`, `서버 규칙` |
| B10 토큰 | 새 토큰 없음. 멈춤 버튼(미정 1 C)도 기존 보조 원형 버튼 모양 |

미정 1이 C로 정해지면 디자인 보강이 하나 필요합니다(예정 D1). 1장짜리 배너 슬롯은 조작 줄이 없어 멈춤 버튼 자리가 없으므로, 그 자리와 문구를 handoff에 더합니다.

## 티켓 분해

| 예정 | 단계 | 역할 | 선행 | 요구 | 수용 기준 요약(확인 방법) |
| --- | --- | --- | --- | --- | --- |
| T1 | 티켓 | api | — | R20, R21 | 계약·스키마. 대상: `packages/shared`의 위 타입·경로·오류 코드·상수, `resolveBannerSlot`과 그 단위 테스트(`packages/shared` `test` 스크립트), migration `0003_ad_banner.sql`(`lock_timeout`, 되돌리기 주석), `AppConfig` `BANNER_SLOT_MAX`·`BANNER_SLOT_TOTAL_MAX`, `.env.example`·환경변수 문서. 확인: `pnpm --filter @crelink/shared build`, `pnpm --filter @crelink/shared test`, migration 테스트(FK 연쇄 2건·CHECK), AppConfig 파싱 테스트. 미정 1·2가 확정된 뒤 착수합니다. 전체 typecheck는 통합 브랜치에서 T2·T5·T9·T10 뒤에 확인합니다. |
| T2 | 티켓 | api | T1 | R20 ①②⑥⑧, R21 ③, R7 ⑥ | 위치·공개 랜딩·노출·편집 상태. 대상: `LinkOrderRequest.slotIndex` 저장(생략 시 상대 위치 유지), 공개 응답 `slot`·`clickUrl` 규칙, `recordAdStat`과 `passAccepted`일 때만 첫 장 노출 +1, `CreatorLandingState` 추가 필드. API 통합 테스트로 확인할 것: 위치 3가지, 생략 시 유지, 숨김 조건, `passAccepted` 유무별 노출 수와 `clickUrl`. |
| T3 | 티켓 | api | T1 | R20 ④, R21 ② | 움직임 판정: 업로드 때 GIF·WebP·APNG 판정, `files.animated`, `UploadFileResponse.animated`, NULL 파일 지연 판정 도우미. 단위 테스트(세 형식의 움직임·정지 표본). 미정 1이 A·D면 만들지 않습니다. |
| T4 | 티켓 | api | T2, T3 | R21 ②④⑤⑥, R14 | 크리에이터 배너 쓰기(새 `creator/banners.service.ts`·controller): `/api/me/banners…` 4경로, 잠금 순서, 한도(보이는·보관)와 숨김 해제 409, 차단 유지, 차단 도메인 거부, 미부여 403, 정지 이미지 규칙. 통합 테스트(한도 경계 n-1·n·보관 상한, 회수와 쓰기 동시). |
| T5 | 티켓 | api | T1, T3 | R20 ④⑨, R14 | 크리링 배너 운영(새 `admin/ad-banners.service.ts`·controller): 목록(상태·`counts`·누적 합계 `::int`), 등록·수정·내리기(멱등)·정렬, advisory lock, 운영자 이미지 소유 규칙, PATCH 차단 재검사. 통합 테스트(상태 경계 `starts_at = now`·`ends_at = now`, 다른 운영자의 수정, `/end` 두 번, 동시 정렬). |
| T6 | 티켓 | api | T2 | R21 ①④⑤, R14 | 부여·차단: `PUT …/banner-slot`, `PUT /api/admin/banners/{id}/block`, `OperatorCreatorDetail` 추가 필드, 차단 도메인 추가 시 배너 처리(미정 3). 통합 테스트. |
| T7 | 티켓 | api | T2 | R20 ⑧, R21 ④, R9, R11 | 클릭 경로·보존: `GET {SHORT}/a/…`·`/b/…`와 `SHORT_DOMAIN_ROUTES`(접두사 회귀 확인), 클릭 기록, 보존 작업 집계, `OperatorCreatorStats.bannerClicks`(미정 4), 지표·API 문서. 통합 테스트(`short-link.e2e-spec.ts`, 보존 작업). `/b/` 시험의 배너 행은 SQL로 넣습니다. |
| T8 | 티켓 | infra | — | R20 ⑧, R21 ④ | Caddy 단축 호스트 `/a/`·`/b/` matcher와 주석, `infra/prod/README.md` Caddyfile 줄, `infra/CHANGELOGS.md`. `infra/prod/tests/caddy-routing.sh`에 경우를 더합니다. 통과(200 api, 경로·쿼리 그대로): `/a/abcde12345/fghij67890`, `/b/abcde12345`, `/b/abcde12345?x=1`. 404: 세그먼트마다 대문자·9자·11자, `/a/abcde12345`, `/b/abcde12345/fghij67890`, `/a/…/…/extra`, 끝 슬래시, POST·HEAD, `--path-as-is` 상위 경로. 웹 호스트는 web, 색 전환 뒤에도 `/b/`는 api. 머리말 문구도 고칩니다. 확인: `infra/prod/tests/caddy-routing.sh`, `infra/prod/tests/deploy-rollback.sh`(실제 Caddyfile을 `edge_apply`가 validate), 바꾼 스크립트 `bash -n`·`shellcheck`. compose는 바뀌지 않아 `config --quiet`·`make infra-up`은 해당 없음. `harness.sh`는 바꾸지 않습니다. |
| S1 | 스파이크 | web | — | R20 ④, R21 ② | 위 `위험과 스파이크` 첫 줄. 미정 1이 A·D면 만들지 않습니다. |
| D1 | 티켓 | designer | — | R20 ④, R21 ② | 멈춤 버튼 자리·문구(1장 배너 슬롯 포함)를 handoff에 더하고 `pnpm design:check --require-lint`를 통과합니다. 미정 1이 C일 때만 만듭니다. |
| T9 | 티켓 | web | T1, D1 | R20 ①③④⑥, R21 ③, R19, R9 | 공개 랜딩: `BannerCarousel`(children, 초점 규칙, `inert`, `aria-live`)과 `Landing` 배치(`afterLinkCount`, `ul`·빈 랜딩 판정), 이미지 실패 건너뛰기, `<picture>`·멈춤(미정 1), `/privacy` 문구. 계약 기반 mock으로 확인: 위치 3가지·1장·여러 장·숨김·슬롯만 있는 빈 랜딩, 390·1280·320px. 레이블 `크리링 광고`·`다음 배너`. |
| T10 | 티켓 | web | T1 | R20 ②⑦, R18 | 외부 링크 패널 정렬: 광고 행/배너 슬롯 행을 섞은 dnd(키보드, 종류별 안내 문장, 링크 0개 상태), 늘 `slotIndex`를 보냄, 한도 배지. 390·1280px. 레이블 `크리링 광고 블록`·`배너 슬롯`. |
| T11 | 티켓 | web | T9, T10 | R20 ②⑥, R18 | 미리보기·광고 블록 패널·구역 목록: `toLandingPreview`가 `resolveBannerSlot`을 씀, 점선 자리, `EditRegion` 이름표, 새 `LandingEditTarget`, 구역 목록 행, 좁은 화면 칩·시트, `끌어 옮기기` 초점. 390·1280px. |
| T12 | 티켓 | web | T1, S1 | R20 ④, R21 ② | 정지 이미지 도우미: `ImageField`의 3:1 미리보기·안내 문구 prop, `animated` 응답이면 정지 이미지를 만들어 쌍으로 올림. 단위 테스트(자르기 크기), 브라우저 확인. 미정 1이 A·D면 만들지 않습니다. |
| T13 | 티켓 | web | T9, T12 | R20 ④⑧⑨ | 운영자 `/admin/ad-banners`: 메뉴, 표·카드, 걸러보기, 정렬, 대화상자(미리보기·`datetime-local` 변환), 내리기, 경고·빈·로딩·오류(`AdminShell` prop), BFF. 390·700·1280px. |
| T14 | 티켓 | web | T1 | R21 ①④⑤, R10 | 운영자 크리에이터 상세: `배너 슬롯` 묶음, `배너` 카드, 공용 차단 구성 요소, 통계 배너 클릭(미정 4), BFF. 390·1280px. |
| T15 | 티켓 | web | T11 | R21 ②③④⑤⑥ | 배너 슬롯 패널 목록: 배지, 정렬, 숨기기(409 되돌림), 차단 표시, 보이는 배너 0장 문장, 코드별 한도·회수 처리, BFF. 390·1280px. |
| T16 | 티켓 | web | T15, T12 | R21 ②④ | 배너 폼: 필드·검사·저장·삭제 확인, 배너 초안 규칙(미리보기 덮어 그리기), 정지 이미지 올리기. 390·1280px. |
| T17 | 티켓 | orchestrator | T4, T5, T6, T7, T8, T13, T14, T16 | R20, R21 | 통합 브랜치를 main에 한 번 머지합니다. 그 전에: 전체 `pnpm verify`, 실제 API로 E2E `tests/e2e/ad-banner.spec.ts`(아래 검증 계획), mock 제거, E2E 정리 순서. 운영 주소 검사 `infra/prod/verify.sh`에 `{SHORT}/b/zzzzzzzzzz`(와 `/a/zzzzzzzzzz/zzzzzzzzzz`)가 302 `…/notice?reason=link_unavailable`인지 더합니다(T8이 main에 들어간 뒤). `docs/specs/crelink-prod-deploy.md`의 구성도·공개 경로 줄, 변경 기록, 릴리스 노트도 고칩니다. |

### 통합과 배포 순서

- main 머지는 곧 운영 배포(CD)입니다. 그런데 T1은 기존 타입에 필수 필드를 더해 API·웹 컴파일을 깨뜨립니다. 그래서 T1~T7·T9~T16은 통합 브랜치 `work/0063-ad-banner-integration`(T1 착수 때 main에서 만듦)에 머지하고, T17이 main에 한 번 머지합니다(방명록 0047~0050 선례). 각 티켓 브랜치는 통합 브랜치에서 갈라지고 PR 대상도 통합 브랜치입니다. 통합 브랜치 안에서는 웹과 API 응답 모양이 함께 바뀌므로, 티켓 사이의 배포 순서 문제가 없습니다.
- T8(Caddy)은 혼자 먼저 main에 머지합니다. 늦어도 T17 전입니다. T7보다 먼저 들어가도 `/a/`·`/b/`는 API에서 404일 뿐이고, 화면에 이 주소가 나오는 것은 T17 뒤입니다. 반대로 T17이 T8보다 먼저 들어가면 운영 클릭이 Caddy 404가 됩니다.
- 한 릴리스 안에서는 `infra/prod/lib.sh`의 `edge_apply`가 색 전환과 함께 그 릴리스의 Caddyfile을 validate·reload합니다. 롤백할 때도 직전 릴리스의 Caddyfile로 돌아갑니다. 그래서 T17을 롤백하면 클릭 주소가 화면에서 함께 사라집니다.
- 웹은 `block.slot`이 없거나 null이면 슬롯을 그리지 않습니다. Blue/Green 겹침 구간의 안전장치입니다.

### 병렬과 크기

- 계약(T1) 뒤 api(T2 → T4·T6·T7, T3 → T5)와 web(T9 → T11 → T15 → T16, T10, T12 → T13, T14)이 나란히 갑니다. infra(T8)와 S1·D1은 바로 시작할 수 있습니다.
- T4·T6·T7이 T2를 기다리는 데는 이유가 있습니다. T4·T6은 배너 응답 모양과 한도 계산 도우미(`CreatorService`)를, T7은 `recordAdStat`을 함께 씁니다. T11은 T9와 같은 `Landing.tsx`를 고치고, T10의 정렬 행을 씁니다.
- 각 티켓은 PR 하나, 실행 한 번(60분) 안을 목표로 했습니다. 넘칠 것 같으면 구현 담당이 하위 티켓으로 나눕니다.

## 검증 계획

에픽 0063의 통합 수용 기준은 아래 E2E(`tests/e2e/ad-banner.spec.ts`, 예정 T17)로 확인합니다. 기존 fixture로 크리에이터 A(무료)·B(배너 슬롯)·운영자 O 세션을 만듭니다. 기록은 비동기라 `waitForCount`로 DB 행을 기다립니다. 크리링 배너 이미지는 시험이 올린 작은 PNG·GIF입니다.

1. **무료 랜딩 위치 3가지**
   - A는 링크 3개, O는 크리링 배너 2장을 게시합니다.
   - 단축 주소로 연 공개 랜딩 맨 뒤에 광고 블록과 `광고` 배지가 있고 `1 / 2`입니다. `다음 배너`를 누르면 `2 / 2`가 되고, 끝에서 `다음 배너`는 비활성입니다. 5초를 기다려도 장이 그대로입니다.
   - A가 외부 링크 패널에서 광고 행을 키보드로 맨 앞, 2번째 링크 다음으로 옮기면 공개 랜딩 순서도 같습니다.
   - 링크 하나를 슬롯 너머로 옮겨도 화면과 공개 랜딩 순서가 같습니다.
   - 광고 행에는 스위치·삭제가 없고, 한도 배지는 `보이는 링크 3/5`입니다.
2. **숨김**
   - O가 모두 내리면 공개 랜딩에 광고 블록이 없고, 미리보기에는 점선 안내가 보입니다.
   - 다시 게시한 뒤 A가 링크를 모두 숨기면 광고가 없습니다.
   - 포트폴리오 하나를 더하면 링크 목록 자리에 광고 블록만 보입니다.
3. **운영자 크리링 배너**
   - 등록 오류를 확인합니다: `ftp://`는 주소 형식, 차단 도메인, 끝이 시작보다 앞.
   - 미래 시작 배너는 `예약` 걸러보기에만 있고 공개 랜딩에는 없습니다.
   - `전체`에서 순서를 바꾸면 공개 랜딩 순서도 같습니다.
   - `내리기`를 누르면 `끝남`이 되고 공개 랜딩에서 빠집니다. 게시 0장이면 경고 줄이 보입니다.
4. **배너 슬롯 수명**
   - O가 B에 슬롯을 부여합니다. B 랜딩의 광고 자리(같은 위치)는 보이는 배너가 0장이라 숨습니다.
   - B가 배너를 추가합니다. 이미지·대체 문구는 필수, URL은 선택이고, 차단 도메인은 거부됩니다. 공개 랜딩에 배지 없는 배너 슬롯이 보입니다.
   - 보이는 배너가 n장이면 `배너 추가`가 막힙니다. 숨긴 배너를 다시 보이게 하면 409 안내가 나오고 스위치가 되돌아갑니다.
   - O가 배너 하나를 차단합니다. B 패널에 `차단됨`·사유가 보이고 스위치가 잠깁니다. 주소를 바꿔도 차단이 유지됩니다.
   - O가 회수하면 B 랜딩의 같은 위치에 광고 블록이 나오고, O의 `배너` 카드에는 보관 배너가 남습니다.
   - 다시 부여하면 이전 배너가 그대로 보입니다.
5. **편집 중 회수**: B가 배너 폼을 연 채 O가 회수합니다. B가 저장하면 회수 안내가 보이고 처음 구역 목록으로 돌아가며 초안은 버려집니다.
6. **기록과 R7 ⑥**
   - 단축 주소로 A 랜딩을 열면 `ad_banner_daily_stats`의 첫 장 `impressions`가 1 늘어납니다.
   - 광고를 누르면 `{SHORT}/a/{배너}/{A 랜딩}`이 저장된 URL로 302하고 `clicks`가 1 늘어납니다. O 표의 노출·클릭이 DB와 같습니다.
   - A의 관리 미리보기와 O 화면에서 같은 출처로 연 A 랜딩은 수가 늘지 않고, 광고 `clickUrl`이 저장된 URL입니다.
   - B 배너를 누르면 `{SHORT}/b/{배너}`가 302하고 `creator_banner_clicks` 행(visitor_id·IP)이 생깁니다. 숨긴·차단 배너 주소는 `link_unavailable`입니다.
7. **차단 도메인 추가**: O가 B 배너 도메인과 게시 중 크리링 배너 도메인을 막으면 B 배너는 `차단됨`, 크리링 배너는 `끝남`이 됩니다(미정 3 A). 크리링 배너를 기간만 고쳐 다시 열면 422입니다.
8. **방명록·반응형**: 방명록을 켠 랜딩에서 광고는 `링크` 탭에만 있습니다. 공개 랜딩(390·1280·320), 페이지 편집(390·1280), 운영자 화면(390·700·1280)에 가로 넘침이 없습니다.
9. **움직이는 배너(미정 1이 B·C)**: GIF 배너를 올리면 정지 이미지가 함께 저장됩니다. `prefers-reduced-motion: reduce` 에뮬레이션에서는 정지 이미지가, 보통 설정에서는 `움직임 멈추기` 버튼이 보입니다.

- API 통합 테스트(T2~T7)
  - `resolveBannerSlot` 표의 칸마다 공개 응답
  - 위치 유지(slotIndex 생략)
  - 한도 경계(n-1·n·보관 상한), 미부여 403, 회수와 배너 쓰기 동시
  - 운영자 401·403, 다른 운영자의 배너 수정, `/end` 두 번
  - 상태 경계(`starts_at = now`, `ends_at = now`)
  - 보존 작업 뒤 원본 삭제와 집계
- shared 단위 테스트(T1): `resolveBannerSlot`.
- Caddy(T8): `infra/prod/tests/caddy-routing.sh`, `infra/prod/tests/deploy-rollback.sh`.
- 운영 주소 검사(T17): `infra/prod/verify.sh`의 새 클릭 경로 302.
- 기기 확인은 수동입니다. 손가락 스와이프는 iOS 인스타그램 인앱 브라우저에서 한 번(기기가 있을 때), 스크린리더 낭독은 VoiceOver로(가능할 때) 봅니다.
- `pnpm smoke`에는 기능 시나리오를 넣지 않습니다.

## 미정

사용자 결정이 필요했던 질문입니다. 2026-10-09 사용자가 1~4를 모두 `[AI 제안]`대로 정했습니다(아래 `결정` 줄). 그래서 미정 1의 조건부 티켓 T3·S1·T12와 디자인 보강 D1은 모두 진행합니다. 설계 승인은 사용자가 문서를 읽은 뒤 정합니다.

1. **움직이는 배너(GIF·움직이는 WebP·APNG)의 접근성 처리.** 결정 3(그대로 받음)을 전제로 처리 방식만 고릅니다. 5초 넘게 움직이는 내용은 WCAG 2.2.2(수준 A, 멈추기·숨기기 수단)에 걸릴 수 있습니다. `prefers-reduced-motion`으로도 GIF 움직임은 CSS로 멈출 수 없습니다.
   - A. 처리 없음: 비용 0. 2.2.2와 움직임 줄이기 설정 위반 위험이 그대로 남습니다. T3·T12·S1이 빠집니다.
   - B. 정지 이미지: 올릴 때 브라우저가 첫 장면 정지 이미지를 만들어 함께 저장하고(새 의존성 없음, S1), `prefers-reduced-motion: reduce`면 정지 이미지를 보여 줍니다. 컬럼 2개(`files.animated`, `still_file_id`), 업로드 판정(T3), 도우미(T12)가 필요합니다. 2.2.2 위험은 남습니다.
   - C. B + 움직이는 배너에 `움직임 멈추기`/`다시 재생` 버튼(조작 줄, 캐러셀 전체에 적용). 2.2.2까지 맞춥니다. 디자인 보강(D1)이 필요합니다.
   - D. 5초 넘게 움직이는 이미지를 거부(서버가 프레임 지연·반복 수를 읽음). 2.2.2 면제 조건을 맞추지만 결정 3을 좁히고, 업로드 거부 문구가 늘어납니다.
   - `[AI 제안]` C. 수준 A 기준과 디자인 시스템의 움직임 줄이기 존중을 지키면서 GIF를 그대로 받을 수 있습니다. B에 버튼 하나만 더하면 됩니다.
   - **결정(2026-10-09): C.** 정지 이미지를 만들고 `움직임 멈추기`/`다시 재생` 버튼을 둡니다.
2. **크리에이터 배너 단위.** 지금은 랜딩이 1개라 차이가 없고, R6 이후 달라집니다.
   - A. 랜딩 단위: `landing_id`, 한도도 랜딩마다.
   - B. 계정 단위: 모든 랜딩이 같은 배너.
   - `[AI 제안]` A. 근거는 [크리에이터 배너 단위](#크리에이터-배너-단위-ai-제안)에 있습니다.
   - **결정(2026-10-09): A.** 랜딩 단위로 둡니다.
3. **차단 도메인을 추가할 때 기존 크리링 배너.** 크리에이터 배너는 링크처럼 차단합니다(R14 ③). 크리링 배너는 다음 중 하나입니다.
   - A. 게시 중·예약이면 내림(게시 끝 = 지금). 새 컬럼·화면이 없고, 다시 열려면 주소를 고쳐야 저장됩니다.
   - B. 건드리지 않고 운영자가 직접 처리.
   - C. 링크처럼 `blocked_at`을 두고 운영자 화면에 차단 표시·풀기를 추가.
   - `[AI 제안]` A. 운영자가 막은 도메인으로 크리링이 직접 보내는 일을 바로 멈추고, 화면을 더하지 않아도 됩니다.
   - **결정(2026-10-09): A.** 게시 중·예약인 배너는 내립니다.
4. **크리에이터 배너 클릭을 운영자 통계 화면에 보일지.**
   - A. `OperatorCreatorStats.bannerClicks`와 크리에이터 상세 통계 카드에 배너별 클릭 표 추가.
   - B. 기록만 하고 DB 조회로 봄.
   - `[AI 제안]` A. R21 ④가 "외부 링크 클릭처럼"이고, 링크별 클릭은 이미 그 카드에 있습니다. 합계(`totals.linkClicks`)에는 섞지 않습니다.
   - **결정(2026-10-09): A.** 크리에이터 상세 통계에 배너별 클릭 표를 둡니다.

정해 둔 값은 `[임시값]`이며 바꿀 수 있습니다. 보이는 배너 상한 5와 보관 상한 20(PRD R21 ② "처음 값은 기술 설계에서"), 공개 응답 지연 목표, 운영자 표 질의 기준입니다. 노출 기준(서버·`passAccepted`·첫 장)은 승인된 handoff의 운영자 도움말과 같으므로 설계 승인으로 확정합니다.

## 검토 기록

- 2026-10-09 orchestrator: 초안 작성.
- 2026-10-09 api(읽기 전용 검토, 판정 통과(수정 권장)): 지적 13건. 모두 반영했습니다.
  - 통합·배포 순서
    - T1 혼자서는 typecheck가 깨집니다. 통합 브랜치로 모으고 T1 수용 기준을 바꿨습니다.
    - 정렬 응답 모양 변경을 철회하고 `LinkView[]`를 유지합니다.
  - 데이터 모델
    - `slotIndex`를 생략했을 때 "유지"를 상대 위치 보존으로 정의했습니다.
    - `files.animated`를 NULL 허용으로 바꿨습니다. NULL은 0003 전 파일이고, 저장 때 판정합니다.
    - 되돌리기에 `schema_migrations` 행 삭제를 더했습니다.
    - FK 근거 문장을 고치고, migration 테스트 2건을 더했습니다.
    - `creator_banners.public_id`·`alt` CHECK를 더했습니다.
  - 서버 규칙
    - PATCH로 이미지를 바꿀 때 정지 이미지 규칙을 정했습니다.
    - 다른 운영자가 올린 이미지의 소유 검사 규칙을 정했습니다.
    - 게시 기간 상태 부등호, 입력 `>`·DB `>=`, `/end` 멱등, 시간대 없는 ISO 거부를 정했습니다.
    - 크리링 배너 PATCH·POST에서 차단 도메인을 다시 검사합니다.
  - 동시성·질의
    - 잠금 → 부여 → 소유 → 한도 순서를 정하고, 크리링 배너 쓰기를 advisory lock으로 줄 세웁니다.
    - 공개 질의 구성(새 질의 하나, 숨김 포함 링크 질의, 첫 list 구역), 풀 6 조건을 적었습니다.
    - 합계 `::int`, `/b/`의 short_link 조인 기준을 적었습니다.
  - 테스트·설정
    - `resolveBannerSlot` 테스트 위치(shared `node --test`)를 정했습니다.
    - `.env.example`에도 설정 키를 적습니다.
  - 티켓
    - T2에서 움직임 판정을 떼어 T3으로 두었습니다.
    - 운영자 API를 T5(크리링 배너, T2와 나란히)와 T6(부여·차단)으로 나눴습니다.
    - T7 선행을 T2로 두었습니다(`recordAdStat` 공유).
- 2026-10-09 web(읽기 전용 검토, 판정 통과(수정 권장)): 지적 12건. 모두 반영했습니다.
  - 통합·계약
    - 병합·배포 전략을 정하고, `block.slot`이 없으면 그리지 않습니다.
    - T1 typecheck(api 지적과 같음)를 반영했습니다.
    - `resolveBannerSlot`이 숨김 사유와 위치를 돌려줘 미리보기 점선 자리를 그립니다.
    - `UploadFileResponse.animated`를 더했습니다.
  - 미리보기·편집 상태
    - 배너 초안 규칙과 `ManagerDirty` 연결을 정했습니다.
    - 화면 상태 표에 빠진 줄을 더했습니다: 미리보기 배너 슬롯 고르기, 구역 목록 행, 좁은 화면 칩·시트, 끌어 옮기기 초점, 삭제 확인, 보이는 배너 0장 문장.
    - `LandingEditTarget` 새 종류를 더했고, edit 모드에서는 `<a>`를 그리지 않습니다.
    - 미리보기 배너 id는 uuid라고 적었습니다.
    - 새 웹은 늘 `slotIndex`를 보내고, 안내 문장은 섞인 목록 기준입니다.
  - 공개 랜딩
    - `ul`을 그리는 조건과 빈 랜딩 문구의 관계를 정했습니다. 슬롯만 있으면 빈 랜딩이 아닙니다.
    - 캐러셀 초점 규칙을 정하고, 장 내용은 children으로 받습니다. 장별 이름표는 트랙 밖에 둡니다.
    - 움직임 분기는 `<picture>`·CSS 미디어로만 합니다.
  - 정지 이미지
    - 3:1 가운데 자르기 1200×400 PNG를 로컬 File에서 만듭니다.
    - S1 끝낼 조건을 보강했습니다: iOS 미확인 처리, 기록 위치.
  - 오류 문구
    - 웹 고정 문구에는 n을 넣지 않고, 패널이 코드로 직접 처리합니다.
  - 운영자 화면
    - `?status=` 걸러보기를 없애고 서버 렌더 목록을 웹에서 거릅니다. 그래서 BFF `GET`도 없습니다.
    - `AdminShell`에 오류 prop을 더하고, 차단 구성 요소를 공용으로 넓히고, 표·카드는 하나만 그립니다. `loading.tsx`와 `datetime-local` 변환도 넣었습니다.
  - 티켓
    - 웹 티켓을 다시 나눴습니다: T10·T11(관리 화면 위치·미리보기), T12(정지 이미지 도우미), T13·T14(운영자 두 화면), T15·T16(패널·폼).
    - T13 선행에 T9(`BannerCarousel`)를 더했고, D1(멈춤 버튼 자리)을 두었습니다.
    - 확인 폭을 화면별로 정했습니다.
- 2026-10-09 infra(읽기 전용 검토, 판정 통과(수정 권장)): 지적 12건. 반영한 것은 다음과 같습니다.
  - 배포·되돌리기
    - 배포 순서 서술을 하나로 맞췄습니다: T8을 먼저 main에, `edge_apply`의 reload·롤백 근거.
    - 되돌리기는 `schema_migrations` 행을 지우고, 운영에서는 승인이 필요한 수동 작업입니다.
    - 미정 1·2는 T1 전에 확정합니다.
    - `lock_timeout`을 채택했습니다.
  - 시험·검사
    - 시험 경로를 `infra/prod/tests/`로 고쳤습니다.
    - `harness.sh` 변경은 뺐습니다.
    - T8 수용 기준에 경우 목록, `deploy-rollback.sh`, `bash -n`·`shellcheck`를 넣었습니다.
    - 운영 주소 검사 `verify.sh`에 새 클릭 경로 302를 더합니다(T17).
  - 데이터·설정·문서
    - `creator_banners.public_id` CHECK를 더했습니다.
    - 설정값을 나중에 바꿀 때의 `.sops.yaml` 절차를 적었습니다.
    - T8 문서 대상은 `infra/prod/README.md`·Caddyfile 주석·`infra/CHANGELOGS.md`이고, 운영 설계 문서 갱신은 T17이 맡습니다.
  - 남긴 것
    - Caddy matcher를 하나로 묶는 방식은 구현 판단으로 남겼습니다.

## 변경 기록

- 2026-10-09: 초안 작성, 같은 날 api·web·infra 검토 반영.
- 2026-10-09: 사용자가 미정 1~4를 모두 `[AI 제안]`대로 정했습니다(1 C, 2 A, 3 A, 4 A). 그래서 조건부였던 T3·S1·T12·D1을 모두 진행합니다. 설계 승인은 사용자가 문서를 읽은 뒤 정하며, 상태는 `초안`으로 둡니다.
