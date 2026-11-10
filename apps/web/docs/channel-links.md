# 채널 주소 화면

기준은 [채널별 짧은 주소 설계](../../../docs/specs/channel-links.md), 계약은 [`packages/shared/src/channel-links.ts`](../../../packages/shared/src/channel-links.ts)입니다. 새 디자인 문서는 없고 기존 부품(`card`·`field`·`input`·`CopyButton`·`ActionStatus`)으로 만듭니다.

## 화면과 조회

- 관리 메뉴 `채널 주소`(`MANAGER_MENU`의 `channels`)가 `/me/landings/[publicId]/channels`를 엽니다. 메뉴 배열에 등록하지 않으면 편집 미리보기가 붙으므로 새 메뉴는 이 배열에 한 줄을 더해야 합니다. `주소 설정` 메뉴는 리디렉트 껍데기(0234)라 쓰지 않습니다.
- `page.tsx`(Server Component)가 `loadSignedIn`으로 `GET /api/me/channel-links`를 부르고, 목록 상태는 `ChannelLinks`(Client Component)가 들고 있습니다. 조회 오류는 `ErrorPanel`의 `다시 시도`(문서 새로 불러오기)입니다.
- 만들기 `POST`는 같은 조합이 이미 있으면 그 주소(200)를 돌려주므로 목록 맨 위로 올리고 `이미 있어요` 안내를 보여 줍니다. 보관 `POST …/{code}/archive`는 목록에서만 지웁니다. 보관해도 이미 공유한 주소는 계속 열립니다.
- 소유자 전용입니다(0243·0244): 대상 페이지는 주소의 publicId로 만든 `X-Crelink-Page` 헤더(브라우저 `browserApi`, 서버 `loadSignedIn(path, publicId)`)로 정해지고, 편집자에게는 메뉴를 숨기며 직접 주소로 들어오면 API의 403을 `소유자만 쓸 수 있어요.` 안내로 보여 줍니다.
- BFF 허용 목록(`lib/api/backend-rules.ts`): `GET·POST api/me/channel-links`, `POST api/me/channel-links/{code}/archive`.
- 오류 문구는 `lib/api/errors.ts`가 코드별로 정합니다(`channel_link_not_found`, `channel_link_limit_reached`, `channel_link_total_limit_reached`). 활성 주소가 50개면 버튼을 막고 사유를 보여 줍니다. 200개(보관 포함) 한도는 서버 응답으로 알립니다.

## 공개 페이지의 `via`

`/p/[publicId]`는 `via`(7~10자 영소문자·숫자일 때만, `lib/channel-links.ts` `readLandingVia`)를 `loadLanding`의 세 번째 인자로 넘겨 요청당 한 번만 조회합니다. API가 이 페이지의 code로 확인하면 응답의 `utm`을 `VisitorTracker`에 넘기고, 통과 표시가 없을 때는 `shortUrl`(`{SHORT}/s/{code}`)로 UTM 없이 돌려보냅니다. `PassCleanup`은 `pass`만 지우므로 `via`는 주소창에 남고, 새로고침·복사로 다시 들어오면 `/s/{code}`를 한 번 거쳐 기록됩니다. 자세한 흐름은 [방문 계측](visitor-telemetry.md#경계와-데이터)을 따릅니다.

## 확인

`node --test src/lib/channel-links.spec.ts`(목록 이름·`via` 정규화). 화면은 `make up` 뒤 ego-browser로 390px·1280px에서 만들기·복사·보관·가로 넘침을 확인합니다.
