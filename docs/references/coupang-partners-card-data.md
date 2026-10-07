# 쿠팡 파트너스 링크 카드 정보 채우기 방식 비교

- 확인일: 2026-10-07 (약관은 이날 게시된 2026-09-07 적용본, API 명세는 이날 파트너스 도움말 `문서` 탭 기준)
- 조사 질문: 크리에이터가 공개 랜딩의 스와이프 카드 블록에 쿠팡 파트너스 링크를 넣을 때, 카드의 상품 사진·이름(·가격)을 무엇으로 채울 수 있는가? 특히 쿠팡 파트너스 API로 상품 ID나 쿠팡 URL·파트너스 단축 URL에서 상품 정보를 얻을 수 있는가?
- 관련: [크리링 PRD](../product/crelink.md) R5(구역별 표시 종류)·R13(무료 링크 5개)·R14(위험한 링크 검사)·R18(관리 화면), 공유 계약 `packages/shared/src/crelink.ts`(링크 `thumbnail`·`faviconUrl`, 공개 뷰 `thumbnailUrl`·`clickUrl`), [유사 서비스 벤치마킹](../product/research/link-in-bio-benchmark.md), work item `docs/work/orchestrator/0045-block-swipe-cards.md`

외부 서비스 정보는 확인일 기준이며 바뀔 수 있습니다. 이 문서는 선택지 비교이고 결정은 사용자가 합니다. 약관 해석은 법률 자문이 아닙니다. 작성 기준은 [제품 탐색과 PRD](../product/README.md#조사-품질-기준)를 따릅니다. 표기: 출처로 확인한 사실은 표시 없이, 근거에서 끌어낸 추론은 `[추정]`, 크리링에 주는 제안은 `[AI 제안]`입니다.

## 요약

- **상품 ID나 쿠팡 URL·파트너스 단축 URL로 상품 정보(사진·이름·가격)를 돌려주는 공식 파트너스 API는 없습니다.** 파트너스 API 명세(Swagger 2.0, 16개 경로)의 상품 API는 카테고리 베스트·골드박스·쿠팡 PL·키워드 검색·개인화 추천뿐이고, 어느 경로에도 상품 ID·URL 입력이 없습니다. URL을 받는 유일한 API인 `POST /deeplink`는 쿠팡 URL을 파트너스 추적 단축 URL로 바꿀 뿐 상품 정보를 주지 않습니다([명세](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_SPEC), [도움말 문서 탭](https://partners.coupang.com/#help/open-api)).
- 파트너스 API는 최종 승인된 회원만 쓸 수 있고, 인증 키를 제3자에게 제공·공유하는 것과 API로 받은 데이터를 복제·저장·전송하는 것이 약관상 금지입니다. 크리링이 크리에이터별 키를 받아 보관하거나, API 응답(사진·가격)을 저장해 카드에 쓰는 방식은 약관과 충돌할 가능성이 큽니다([이용약관·오픈 API 서비스 이용 약관](https://partners.coupang.com/#help/terms), [운영정책](https://partners.coupang.com/#help/operating-policy)).
- 서버가 쿠팡 상품 페이지를 열면 403이고, 파트너스 단축 주소를 열면 클릭 추적 값이 붙은 주소로 302 이동합니다(오케스트레이터 2026-10-07 curl 확인). 약관은 로봇·스크레이퍼 등 자동화 수단의 접근과 자동화된 클릭을 금지합니다. **서버가 쿠팡·파트너스 주소를 여는 OG 수집은 쓰지 않아야 합니다.**
- 파트너스 '상품 링크' 화면은 단축 URL과 두 가지 코드를 줍니다: `일반태그`(iframe, 상품명 텍스트 없음)와 `블로그용 태그`(`<a><img></a>`, 이미지는 파트너스가 만든 상품+쇼핑 버튼 배너 `[추정]`, `alt`에 잘릴 수 있는 상품명). 붙여 넣은 코드에서 링크와 상품명 후보는 뽑을 수 있지만 **원본 상품 사진과 온전한 상품명은 확실하게 얻을 수 없고**, 가격은 없습니다(로그인 화면 확인, 아래 절).
- `[AI 제안]` 쿠팡 카드는 **파트너스 URL 붙여 넣기 + 크리에이터 직접 입력(사진 업로드·이름)을 기본**으로 하고, `블로그용 태그` 붙여 넣기는 링크·이름을 미리 채우는 보조 경로로만 둡니다. 파트너스 API 연동과 가격 표시는 하지 않습니다. 결과적으로 쿠팡 링크는 "링크를 전달하면 정보를 가져와 채운다"를 완전히 만족할 수 없으므로 이 점을 사용자에게 확인합니다. 쿠팡 외 링크의 OG 자동 채움은 별도 결정으로 두고, 하게 되면 아래 [OG 수집 위험](#쿠팡-외-링크의-og-수집-위험설계에서-다룰-항목)을 설계에 넣습니다.

## 로그인 화면 확인 결과

2026-10-07 사용자가 로그인한 본인 파트너스 계정 화면을 오케스트레이터가 Orca 내장 브라우저로 읽기만 하며 확인했습니다(계정 정보·AF ID는 적지 않음). 출처 주소는 모두 로그인이 필요합니다.

1. **메뉴**: 링크 생성(상품 링크 `https://partners.coupang.com/#affiliate/ws/link`, 간편 링크 만들기 `#affiliate/ws/link-to-any-page`, 다이나믹 배너, 카테고리 배너, 검색 위젯, 이벤트/프로모션 링크), 추가 기능 > 파트너스 API(`https://partners.coupang.com/#affiliate/ws/tools/open-api`), 리포트, 약관 및 정책, 도움말.
2. **파트너스 API 화면**: "API키는 최종 승인된 회원만 발급이 가능합니다." 확인한 계정은 최종 승인 전이라 `생성` 버튼이 비활성입니다. 도움말 가이드의 최종 승인 전 메일 문의 안내, 키 유출 주의, 서명 형식은 아래 [키 발급 조건과 서명](#키-발급-조건과-서명)과 같습니다.
3. **API 명세**: `문서` 탭이 불러오는 Swagger 2.0 명세의 경로·모델이 아래 [제공 경로](#제공-경로)와 같습니다. 리포트는 시작~종료 30일 이내, 1시간당 500회, 매일 15:00 갱신입니다. **상품 ID·쿠팡 URL·파트너스 단축 URL로 상품 정보(이미지·이름·가격)를 직접 조회하는 경로는 없고**, 정보를 받으려면 키워드 검색·베스트·골드박스·PL·추천 결과에서 고르는 방식뿐입니다. (명세 JSON 주소는 이 조사에서 로그인 없이 curl로도 200을 받았습니다.)
4. **Open API 가이드 V2 탭**: `POST /v2/providers/affiliate_open_api/apis/openapi/v2/products/reco`의 요청은 `site`/`app`, `device{id(GAID·IDFA 필수), lmt 필수}`, `imp{imageSize 필수}`, `user{puid 필수}`, `affiliate{subId}`이고, 응답은 `isRocket`·`productId`·`productImage`·`productName`·`productPrice`·`productUrl`·`categoryName`·`impressionUrl`(노출 시 클라이언트에서 호출)입니다. 정책(캐시 웹 5분·앱 60분, 캐시·변조 금지, 분당 100회)은 아래와 같습니다.
5. **상품 링크 화면**: 3단계(상품 탐색 → 상품 선택 → "URL 혹은 배너 만들기"). 코드 종류 탭은 `일반태그`(iframe, 보더 켬/끔)와 `블로그용 태그`(이미지)이고, "iframe 이 적용되지 않는 곳에는 블로그용 태그를 이용하세요"라고 안내합니다. 프런트 코드상 생성 시 `POST /api/v1/banner/iframe/url {group, product}` 응답으로 `shortUrl`·`iframeHtmlTagBorderOn/Off`·`title`·`description`·`imageUrl`을 받고, 블로그용 태그는 `POST /api/v1/banner/gen`으로 만든 배너 이미지(상품+쇼핑 버튼)를 씁니다 `[추정]`(실제 생성 버튼은 링크가 만들어지므로 누르지 않음). 따라서 크리에이터가 붙여 넣는 코드는 iframe(상품명 텍스트 없음)이거나 생성된 배너 이미지라, 상품명·원본 상품 이미지 추출이 확실하지 않습니다.
6. **단축 URL**: 파트너스 단축 URL(`link.coupang.com/a/…`)은 생성 시점에 만들어집니다. 쿠팡 페이지 URL을 그대로 쓰면 수익에 반영되지 않습니다([이용 가이드 2025-02](https://partners.coupangcdn.com/partners-guide/partners-guide-20250206163324.pdf)).

## 요구 조건

- 크리에이터가 블록(구역) 안에서 가로로 넘기는 카드에 상품 사진·이름을 보이게 한다(사용자 결정 2026-10-07: 블록마다 표시 종류를 리스트형·스와이프 카드형 중에서 정함).
- 링크를 전달하면 정보를 가져와 채운다(사용자 결정 2026-10-07).
- 쿠팡 링크가 있으면 대가성 문구를 자동으로 표시한다(사용자 결정 2026-10-07).
- 카드 링크도 계정당 무료 링크 5개(R13)에 포함한다(사용자 결정 2026-10-07).
- 크리에이터의 파트너스 수익이 유지되어야 한다. 즉 방문자가 누르는 주소는 크리에이터의 파트너스 추적 주소여야 하고, 크리링이 클릭을 만들거나 바꾸면 안 된다.
- 크리링 서버의 보안(SSRF)·운영 부담을 늘리지 않는다.

## 쿠팡 파트너스 API

### 제공 경로

Base URL: `https://api-gateway.coupang.com/v2/providers/affiliate_open_api/apis/openapi/v1/`. 도움말 `문서` 탭이 불러오는 Swagger 2.0 명세(`info.version` `0.0.1.RELEASE`)에서 확인했습니다([명세 JSON](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_SPEC)).

| 경로 | 입력 | 출력 | 호출 제한(명세 문구) |
| --- | --- | --- | --- |
| `POST /deeplink` | `coupangUrls`(1~20개), `subId` | `originalUrl`, `shortenUrl`, `landingUrl` | 별도 문구 없음 |
| `GET /products/bestcategories/{categoryId}` | 카테고리 코드(1001 여성패션 등), `limit`(최대 100, 기본 20), `subId`, `imageSize` | `Product[]` | 별도 문구 없음 |
| `GET /products/goldbox` | `subId`, `imageSize` | `Product[]`(매일 07:30 갱신) | 별도 문구 없음 |
| `GET /products/coupangPL`, `/products/coupangPL/{brandId}` | 브랜드 코드, `limit`, `subId`, `imageSize` | `Product[]` | 별도 문구 없음 |
| `GET /products/search` | `keyword`(필수), `limit`(최대 10), `subId`, `imageSize`, `srpLinkOnly` | `landingUrl`, `productData: SearchProduct[]` | 1분당 최대 50번 |
| `GET /products/reco` | `deviceId`(ADID·GAID·IDFA), `subId`, `imageSize` | `ProductReco[]` | 별도 문구 없음 |
| `GET /reports/*` 9개(clicks·orders·cancels·commission, ads/impression-click·orders·cancels·performance·commission) | 기간·페이지 | 실적 | 1시간당 최대 500번 |

- 응답 공통 형식은 `{ rCode, rMessage, data }`이고 오류는 400·403·429·500입니다.
- 상품 응답 필드: `Product`는 `productId`(int64), `productName`, `productPrice`(int64), `productImage`(URL), `productUrl`(추적 URL `https://link.coupang.com/re/AFFSDP?lptag=AF…&pageKey=…&itemId=…&vendorItemId=…&traceid=…`), `categoryName`, `isRocket`, `isFreeShipping`. `SearchProduct`는 여기에 `keyword`, `rank`가 더해지고 `categoryName`이 없습니다. `ProductReco`는 `productId`·`productName`·`productPrice`·`productImage`·`productUrl`·`isRocket`입니다. 명세 예시의 `productImage`는 `static.coupangcdn.com/image/product/...` 또는 `ads-partners.coupang.com/image1/...`(긴 인코딩 문자열) 형식입니다.
- **상품 ID·URL 입력 경로 없음**: 16개 경로의 매개변수 중 이름에 `product`가 들어간 것이 없고, 상품 정보 경로의 입력은 카테고리·브랜드 코드·키워드·기기 ID뿐입니다(명세 JSON을 직접 검사).
- `deeplink`가 받는 URL 형식: 쿠팡 홈, 상품 상세(`https://www.coupang.com/vp/products/70624070`), 검색 결과, 기획전, 골드박스, 로켓와우, 로켓배송, 로켓직구, 여행 상품. 응답은 단축 URL(예시 `https://coupa.ng/blE0dT`)과 전체 랜딩 추적 URL입니다. FAQ: 법적 문제나 판매자 요청으로 링크 생성이 안 되는 상품이 있습니다([도움말 FAQ](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_FAQ)).
- FAQ: Product API는 호출 시점에 품절된 상품을 보여 주지 않습니다.
- Reco v2(`POST /v2/providers/affiliate_open_api/apis/openapi/v2/products/reco`)와 노출 측정 가이드: 노출 트래커는 실제 사람이 상품을 본 경우에만 실행하고, 캐시 만료는 웹 5분·앱 60분, "노출 측정 가이드라인에 명시된 기준을 초과하여 API 응답을 캐시하지 않습니다", "API 응답을 변조하지 않습니다", 기본 QPS는 분당 100회입니다([Open API 가이드 V2](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_V2_GUIDE)).

### 상품 ID·URL에서 정보를 얻는 우회책과 신뢰도

| 우회책 | 방법 | 신뢰도·문제 |
| --- | --- | --- |
| 키워드 검색 | 크리에이터가 넣은 상품명(또는 상품 ID 문자열)으로 `products/search`를 불러 `productId`가 같은 결과를 고름 | 낮음 `[추정]`. 결과는 최대 10개라 원하는 상품이 없을 수 있고, 상품 ID를 키워드로 넣었을 때 맞는 상품이 나오는지는 키가 없어 확인하지 못함. 응답의 `productUrl`은 키 주인의 추적 URL이라 크리에이터 링크와 다름. 응답 저장 금지(아래 약관)와 1분 50회 제한 |
| 서버가 상품 페이지 OG 수집 | `www.coupang.com/vp/products/...` HTML의 `og:image`·`og:title` | 사용 불가. 일반 브라우저·facebookexternalhit·Twitterbot·kakaotalk-scrap UA 모두 403(오케스트레이터 2026-10-07 확인). 약관이 로봇·스크레이퍼 접근을 금지 |
| 서버가 파트너스 단축 주소를 따라감 | `link.coupang.com/a/…`를 열어 최종 상품 URL을 알아냄 | 사용 금지 수준. 브라우저 UA는 200 "Deeplink Redirect" HTML(OG 없음), facebookexternalhit UA는 302로 `lptag=AF…`·`traceid`·`clickBeacon`·`wPcid`가 붙은 상품 URL로 이동(오케스트레이터 2026-10-07 확인). 서버 요청이 클릭으로 집계될 위험 `[추정]`, 약관의 자동화 클릭 금지에 해당할 수 있음 |
| `HTML 복사` 코드 붙여 넣기 | 크리에이터가 파트너스 화면에서 복사한 코드를 크리링이 파싱 | 높음(형식은 공개 예시 기준). 서버가 쿠팡에 요청하지 않음. 이미지·상품명만 있고 가격 없음. 아래 절 |

### 키 발급 조건과 서명

- 파트너스 API는 최종 승인된 회원에게만 제공되며 무료입니다. 최종 승인 전에 필요하면 AF ID와 광고 게재 영역·형태를 파트너스 메일로 보내 검토를 받습니다. 키는 상단 메뉴 `Tools → 파트너스 API`에서 생성 버튼으로 바로 받습니다([도움말 가이드 탭](https://partners.coupang.com/#help/open-api), [FAQ](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_FAQ)).
- FAQ: Access Key·Secret Key의 재발급·삭제는 지원하지 않습니다. 일별 호출 한도는 따로 없지만 비정상 사용은 제한하고, 호출 횟수 제한에 도달하면 24시간 사용이 제한됩니다.
- 최종 승인: 운영정책 1.3은 "지급할 수익이 이용약관 제5조 제3항에서 정한 최소 지급 금액(10,000원) 이상 발생한 경우" 미디어를 검토해 결정한다고 적습니다([운영정책](https://partners.coupang.com/#help/operating-policy), [이용약관 제5조](https://partners.coupang.com/#help/terms)). 이용 가이드는 최종 승인이 되어야 정산과 파트너스 API 이용이 가능하다고 적습니다([이용 가이드 2025-02](https://partners.coupangcdn.com/partners-guide/partners-guide-20250206163324.pdf) 19p 부근). 블로그·커뮤니티는 FAQ 문구를 "누적 판매 금액 15만원 이상 발생 시 채널 검토 후 최종 승인"으로 인용합니다([인프런 질문](https://www.inflearn.com/community/questions/170881), [알뜰 송송 매거진 2022-10](https://mg.jnomy.com/coupang-partners-verify)). 현재 공식 문구(수익 1만 원)와 블로그 인용(판매 15만 원)은 같은 기준일 수 있지만 `[추정]`, 실제 화면 확인이 필요합니다.
- 서명: 모든 요청의 `Authorization` 헤더에 `CEA algorithm=HmacSHA256, access-key={ACCESS_KEY}, signed-date={yyMMdd'T'HHmmss'Z' (GMT)}, signature={hex}`. 서명 메시지는 `signed-date + method + path + query`이고 Secret Key로 HMAC-SHA256합니다. 오류 예: `Invalid signature.`, `Specified signature is expired.`, `HMAC format is invalid.`([도움말 가이드 탭](https://partners.coupang.com/#help/open-api)).
- 호출 제한 문서가 서로 다릅니다: 현재 명세는 검색 1분 50번·리포트 1시간 500번, 2024-07 이용 가이드는 검색 1시간 10번·리포트 1시간 50번·그 밖 1시간 100번과 위반 1회 24시간 차단·3회 모든 파트너스 기능 차단, V2 가이드는 기본 분당 100회입니다([이용 가이드 2024-07](https://partners.coupangcdn.com/partners-guide/partners-guide-20240711135620.pdf) 33p). 연동한다면 가장 낮은 값을 기준으로 잡아야 합니다 `[추정]`.

### 크리에이터별 키를 크리링이 보관해야 하는가

- 크리에이터의 링크로 수익이 나려면 카드의 주소는 크리에이터의 추적 주소여야 합니다. 크리링 키로 받은 `productUrl`·`shortenUrl`은 크리링 계정의 `lptag`를 담으므로 크리에이터 수익이 되지 않습니다 `[추정]`(명세 예시 `lptag=AF1234567`).
- 그래서 API로 크리에이터 링크를 만들려면 크리에이터 키가 필요한데, 약관이 이를 막습니다.
  - 오픈 API 서비스 이용 약관 제4조: "자신의 인증키를 제3자에게 제공, 공개, 공유, 대여 또는 양도할 수 없습니다", 1개의 인증키만 사용.
  - 운영정책 4.1의 5) 광고미디어 권한의 재판매: "부여 받은 광고미디어로서의 권한(API Key를 포함하며 이에 한정하지 아니함)을 회사의 서면 동의 없이 타인 또는 타 매체에 공유, 제공, 양도, 중개, 재 판매 등을 할 수 없습니다."
  - 이용약관 제8조: 회원 계정을 타인에게 공유·제공·중개하는 행위 금지.
- `[추정]` 크리에이터가 크리링에 키를 맡기는 구조는 "제3자에게 제공"에 해당할 가능성이 커 쿠팡의 서면 동의(제휴) 없이 하면 크리에이터 계정이 제재될 위험이 있습니다. 또 최종 승인 전 크리에이터(신규 크리에이터 대부분 `[추정]`)는 키가 없습니다.

### 약관상 API 응답 표시 조건

- 오픈 API 서비스 이용 약관 제5조: API로 받은 데이터의 저작권은 회사 또는 제3자에게 있고, "API 서비스를 통해 제공된 해당 데이터를 복제, 저장 또는 전송할 수 없습니다."
- 같은 약관 제6조: 회사가 제공한 정보 변경, 변조로 API 데이터를 왜곡하는 행위 금지.
- V2 가이드: 응답 캐시는 웹 5분·앱 60분을 넘기지 않고, 요청마다 최신 데이터를 받으라고 적습니다.
- 이용약관 제8조: "회사가 프로그램과 관련하여 제공한 광고의 내용, 링크, 순서 및 이에 포함된 정보 등을 변경, 조작하는 등의 행위" 금지. 운영정책 4.1의 1): "회사가 전송하는 광고의 링크, 형태, 갱신주기 및 이에 포함된 정보에 대한 별도의 조작 행위" 금지.
- `[추정]` API로 받은 사진·가격을 DB에 저장해 카드에 계속 보여 주면 저장 금지와 캐시 기준에 어긋나고, 가격은 바뀌므로 오래된 값이 남으면 표시광고법상 사실과 다른 표시가 될 위험도 있습니다. 가격 갱신 의무를 명시한 문구는 찾지 못했지만 캐시 5분 기준과 저장 금지가 사실상 그 역할을 합니다.

### deeplink 변환과 클릭 집계

- `deeplink`는 쿠팡 URL을 받아 단축·랜딩 URL을 돌려주는 생성 API이고, 명세에는 호출이 클릭으로 집계된다는 문구가 없습니다. 클릭은 방문자가 추적 URL(`link.coupang.com/...`)을 열 때 집계된다고 보는 것이 자연스럽습니다 `[추정]`(오케스트레이터 확인에서 단축 주소를 연 응답에 `clickBeacon`·`traceid`가 붙음). 키가 없어 직접 확인하지 못했습니다.
- 크리에이터는 이미 파트너스 화면에서 추적 링크를 만들어 붙여 넣으므로, 크리링에는 `deeplink`가 필요하지 않습니다 `[추정]`. 이용 가이드는 쿠팡 페이지 URL을 그대로 복사하면 수익에 반영되지 않는다고 적습니다([이용 가이드 2025-02](https://partners.coupangcdn.com/partners-guide/partners-guide-20250206163324.pdf)).

## 파트너스 '상품 링크'의 HTML 복사 코드

이용 가이드: 상품 링크는 "URL을 직접 복사하여 원하는 포스트에 입력하거나, HTML을 복사하여 위젯으로 사용할 수도 있습니다"([이용 가이드 2025-02](https://partners.coupangcdn.com/partners-guide/partners-guide-20250206163324.pdf)). 2024-07 가이드: "URL은 일반 포스팅에, HTML은 블로그 위젯으로 사용할 수 있습니다", 다이나믹 배너는 자바스크립트/iframe으로만 제공([이용 가이드 2024-07](https://partners.coupangcdn.com/partners-guide/partners-guide-20240711135620.pdf) 26p).

공개 예시로 확인한 형식(공식 문서에는 코드 원문이 없어 블로그·게시물 예시 기준). 로그인 화면에서는 탭 이름이 `일반태그`(iframe)와 `블로그용 태그`(이미지)였습니다([로그인 화면 확인 결과](#로그인-화면-확인-결과) 5):

```html
<!-- 이미지형(a + img). 2019 예시: https://aboneu.tistory.com/42 -->
<a href="https://coupa.ng/bhb5Wu" target="_blank"><img src="https://static.coupangcdn.com/image/affiliate/banner/35051f6de7f60a39c4b0e13618de64f1@2x.jpg" alt="에스엔피 자아련 은.." width="120" height="240"></a>

<!-- iframe형. 2026-05 게시물 예시: https://www.threads.com/@sheegae1/post/DYpCgpqCZCP -->
<iframe src="https://coupa.ng/cm2hNx" width="120" height="240" frameborder="0" scrolling="no" referrerpolicy="unsafe-url" browsingtopics></iframe>
```

- `블로그용 태그`(이미지형)에는 링크(`href`), 이미지(`src`, `*.coupangcdn.com/image/affiliate/banner/...`), 상품명(`alt`)이 있습니다. 이미지 경로가 `affiliate/banner`이고 로그인 화면 확인에서 블로그용 태그가 생성된 배너 이미지(상품+쇼핑 버튼)를 쓰는 것으로 보여 `[추정]`, **카드 사진으로 쓰기에는 원본 상품 사진이 아니고 비율도 맞지 않을 수 있습니다**(예시 120×240). 위 예시처럼 **`alt`가 잘린 상품명**("은..")일 수 있어 크리에이터가 이름을 고칠 수 있어야 합니다 `[AI 제안]`. 가격은 없습니다.
- `일반태그`(iframe형)에는 링크 주소만 있고 이미지·상품명이 없습니다(카드는 iframe 안을 쿠팡이 그림). 크리링이 iframe을 그대로 넣으면 카드 디자인을 맞출 수 없고 iframe 안 클릭은 크리링 클릭 기록(`/c/{id}`)을 거치지 않습니다 `[추정]`. 그래서 iframe형은 링크만 뽑고 사진·이름은 직접 입력하게 합니다 `[AI 제안]`.
- 최근 예시들은 `referrerpolicy="unsafe-url"`을 붙입니다(위 iframe 예시, [Facebook 게시물 예시](https://www.facebook.com/100003446397610/posts/26311928908505297)). 쿠팡이 클릭 출처 페이지 전체 주소를 받으려는 것으로 보이며 `[추정]`, 운영정책은 "프로그램에 등록되지 않은 미디어에 광고를 노출시키는 행위"를 금지합니다. 크리에이터는 크리링 랜딩 주소를 파트너스 활동 페이지로 등록해야 할 수 있습니다 `[추정]`.
- 최근 단축 주소는 `link.coupang.com/a/…`(오케스트레이터가 확인한 `https://link.coupang.com/a/eapy20`)이고 과거 예시와 API 예시는 `coupa.ng/…`입니다. 둘 다 받아야 합니다.

### 붙여 넣은 HTML에서 안전하게 뽑기 `[AI 제안]`

1. 붙여 넣은 HTML은 **렌더링하지 않고** 서버(또는 클라이언트와 서버 양쪽)에서 HTML 파서로 읽어 값만 뽑습니다. 정규식으로 태그를 자르지 않습니다.
2. 허용 태그는 `a`·`img`·`iframe`만 보고, 첫 번째 `a[href]` 또는 `iframe[src]`에서 링크, 그 `a` 안의 `img[alt]`에서 이름 후보를 뽑습니다. `img[src]`는 배너 이미지일 가능성이 커 기본으로 카드 사진에 쓰지 않습니다. `script`(다이나믹 배너·검색 위젯)가 있으면 상품 링크 코드가 아니라고 안내합니다.
3. 링크 호스트는 WHATWG URL 파서로 읽어 `link.coupang.com`·`coupa.ng`와 정확히 같을 때만 쿠팡 파트너스 링크로 봅니다(접미사 비교 금지, `https:`만). 이미지를 쓰게 되면 호스트는 `coupangcdn.com`의 하위 도메인만, `https:`로 바꿔 저장합니다.
4. `alt`는 일반 텍스트로만 쓰고 길이 제한을 둡니다. 저장되는 값은 기존 링크와 같은 필드(제목·URL)이므로 R14 차단 목록 검사를 그대로 거칩니다.
5. 비교 사례: 한 개인 블로그 도구는 쿠팡 HTML 배너를 그대로 본문에 넣되 태그 목록·`coupang.com`/`coupangcdn.com` 호스트(경계까지 비교)·이벤트 속성 금지·인라인 스크립트 검사를 둡니다([Kevinlee7250/cli PR #89](https://github.com/Kevinlee7250/cli/pull/89), 2026-09-29). 크리링은 HTML을 그대로 넣지 않으므로 더 단순합니다.

### 쿠팡 이미지 주소(coupangcdn) 직접 표시

- `https://static.coupangcdn.com/image/affiliate/banner/35051f6de7f60a39c4b0e13618de64f1@2x.jpg`는 `Referer` 없이도, 다른 사이트 `Referer`를 붙여도 200 `image/jpeg`(AmazonS3·CloudFront, `cache-control: max-age=7776000`)였습니다(2026-10-07 curl). 기술적으로 핫링크 차단은 없습니다.
- 명시적인 핫링크 허용 문구는 찾지 못했습니다. 다만 `HTML 복사` 코드 자체가 다른 사이트에서 이 이미지 주소를 불러오도록 만든 것이므로, 코드가 준 이미지 주소를 그대로 표시하는 것은 쿠팡이 의도한 사용 방식에 가깝습니다 `[추정]`. 반대로 이미지를 크리링 저장소에 복사(재호스팅)하면 이용약관 제8조의 지식재산권 침해 금지·"광고의 내용…변경" 금지와 부딪칠 수 있습니다 `[추정]`.
- 직접 표시의 비용: 방문자 브라우저가 쿠팡 CDN에 요청하므로 방문자 IP·Referer가 쿠팡에 전달됩니다(개인정보 처리방침 고지 검토 필요 `[추정]`). 이미지가 지워지면 카드가 깨지므로 대체 표시가 필요합니다.
- 다만 이 이미지는 블로그용 태그용으로 생성된 배너(상품+쇼핑 버튼)일 가능성이 높아 `[추정]`, 카드 사진으로 쓸지는 실제 생성물을 본 뒤 정해야 합니다. 그 전까지는 카드 사진을 크리에이터 업로드로 받는 것이 안전합니다 `[AI 제안]`.

## 서버가 쿠팡·파트너스 주소를 열 때의 위험

| 위험 | 근거 |
| --- | --- |
| 부정 클릭 집계 | 파트너스 단축 주소를 서버가 열면 추적 값(`lptag`·`traceid`·`clickBeacon`·`wPcid`)이 붙은 주소로 302(오케스트레이터 2026-10-07 확인). 운영정책 4.1의 2) 무효클릭: "로봇, 자동화된 클릭 및 노출 생성 도구, 자동 웹 브라우징 … 인위적으로 클릭을 발생시키는 행위", "광고를 사이트 또는 앱의 백그라운드에 숨겨 호출하는 행위" 금지. 이용 가이드: 본인 클릭 금지, 클릭은 "사용자가 그 클릭을 의도했을 경우에만" |
| 약관 위반 | 이용약관 제8조: "로봇, 스파이더, 스크레이퍼 또는 기타 자동화된 수단을 이용하여 서비스에 액세스" 금지. 운영정책 1): "회사의 서버에 부하를 가하는 행위" 금지. 위반 제재는 운영정책 [회원에 대한 제재 조치](https://partners.coupang.com/#help/operating-policy)의 A등급(1회 위반 시 최근 14일 수익금 몰수 등) |
| 403 | 쿠팡 상품 페이지는 브라우저·SNS 수집기 UA 모두 403(오케스트레이터 2026-10-07 확인). 수집이 되더라도 언제든 막힐 수 있음 |
| 크리에이터 계정 제재 | 위 행위의 결과(무효 클릭, 수익 몰수)는 크리링이 아니라 링크 주인인 크리에이터 계정에 떨어짐 `[추정]` |

`[AI 제안]` 링크 저장·미리보기·공개 랜딩 어디에서도 서버가 `link.coupang.com`·`coupa.ng`·`*.coupang.com`에 요청하지 않는 것을 설계 불변 조건으로 둡니다. 공개 랜딩은 카드 링크를 미리 불러오지 않습니다(`prefetch`·`prerender` 금지).

## 쿠팡 외 링크의 OG 수집 위험(설계에서 다룰 항목)

사용자 결정("링크를 전달하면 정보를 가져와 채우는 방식")을 쿠팡 외 링크에 적용하려면 서버가 크리에이터가 넣은 임의 URL을 가져와야 하고, 이는 SSRF 표적이 됩니다([OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) "Case 2 - Application can send requests to ANY external IP address or domain name"). OG 태그 형식은 [Open Graph protocol](https://ogp.me/)입니다. 설계에서 다룰 항목 `[AI 제안]`:

- **목적지 검사**: `http:`·`https:`와 포트 80·443만. DNS 해석 결과 IP를 사설·루프백·링크 로컬(클라우드 메타데이터 `169.254.169.254` 포함)·IPv6 ULA·CGNAT `100.64.0.0/10`(배포 접속에 쓰는 Tailscale 대역)·Docker 내부망 대역에 대해 막고, 검사한 IP로만 연결(DNS rebinding 방지, OWASP 문서의 연결 시점 검사).
- **리디렉션**: 자동 따라가기를 끄고 매 단계 같은 검사, 최대 횟수 제한.
- **수집 금지 목록**: 쿠팡·파트너스 도메인과 다른 제휴 추적 단축 주소는 열지 않음(위 절). R14 차단 목록 도메인도 열지 않음.
- **시간·크기 제한**: 연결·전체 시간 제한, 응답 본문 최대 크기(HTML `<head>`만 읽고 끊기), `Content-Type: text/html`만, 문자 인코딩(EUC-KR 등 한국 사이트) 처리.
- **언제 수집하나**: 저장·편집 시점에만 하고 결과를 저장. 방문자 요청 때 수집하지 않음. 계정별 호출 빈도 제한.
- **값 처리**: `og:title`·`og:description`은 일반 텍스트로 길이 제한, 크리에이터가 고칠 수 있게. 실패하면 지금처럼 파비콘 + 직접 입력으로 떨어짐.
- **이미지 재호스팅 여부**: (a) `og:image` 주소를 그대로 표시하면 서버가 이미지를 받지 않아 안전하지만 방문자 IP가 그 사이트에 전달되고 혼합 콘텐츠(`http:`)·깨짐이 생김. (b) 재호스팅하면 서버가 이미지도 받아야 해 같은 SSRF 검사와 크기·형식 검증, 기존 업로드 경로(이미지 한도 4MB)를 재사용해야 하고 저작권 부담이 생김. 사용자 결정 필요.
- **격리**: 수집기를 API 프로세스와 분리된 출구 프록시·네트워크에서 돌리는 것을 검토(OWASP 문서 Network layer).

## 선택지 비교

| 항목 | A. 파트너스 API 연동 | B. HTML 코드 붙여 넣기 | C. 파트너스 URL + 직접 입력 | D. 조합: C 기본 + B 보조 (`[AI 제안]`) |
| --- | --- | --- | --- | --- |
| 크리에이터가 할 일 | 키 발급(최종 승인 필요) 후 크리링에 키 입력, 상품 검색 | 파트너스 화면에서 `블로그용 태그`·`일반태그` 복사 → 붙여 넣기 | 파트너스 URL 붙여 넣기 + 사진 업로드 + 이름 입력 | URL(또는 블로그용 태그) 붙여 넣기, 사진 업로드, 미리 채운 이름 확인 |
| 채워지는 값 | 사진·이름·가격·링크 | 블로그용 태그: 링크·배너 이미지(원본 상품 사진 아님 `[추정]`)·이름(`alt`, 잘릴 수 있음). 일반태그(iframe): 링크만 | 크리에이터가 넣은 것 | 링크(자동), 이름 후보(블로그용 태그일 때), 사진은 업로드 |
| 상품 ID·URL로 조회 | 불가(공식 API 없음, 키워드 검색 우회는 불확실) | 필요 없음 | 필요 없음 | 필요 없음 |
| 쿠팡 서버 요청 | 크리링 서버 → API | 없음 | 없음 | 없음 |
| 약관 위험 | 높음: 키 제3자 제공 금지, 데이터 저장 금지, 캐시 5분 | 낮음 `[추정]`: 쿠팡이 준 코드의 링크·이미지를 그대로 씀 | 낮음. 단 크리에이터가 올린 쿠팡 이미지의 저작권은 크리에이터 몫 | 낮음 `[추정]` |
| 가격 표시 | 가능하나 5분 이내 갱신 필요 | 불가 | 크리에이터 입력(낡을 위험) | 표시하지 않음 제안 |
| 신규 크리에이터 | 최종 승인 전엔 못 씀 | 가입 직후부터 가능 | 가능 | 가능 |
| 구현·운영 부담 | 높음: 키 암호화 보관·HMAC·제한 관리·캐시 | 중간: HTML 파서·호스트 검사·입력 UI | 낮음: 기존 계약(`thumbnail` 업로드) 재사용 | 중간 |
| 깨짐 위험 | API 변경·키 정지 | 쿠팡 CDN 이미지 삭제, 코드 형식 변경 | 없음 | 낮음(사진은 크리링 업로드, 코드 형식이 바뀌면 이름 미리 채우기만 빠짐) |
| "링크를 전달하면 채운다" 충족 | 채움(단 조회가 아니라 검색 결과에서 고름) | 부분(링크·이름 후보) | 안 됨 | 부분(링크·쿠팡 여부·대가성 문구 자동, 이름 후보) |

## 결론

- 추천 `[AI 제안]`: **D(파트너스 URL + 직접 입력을 기본, 블로그용 태그 붙여 넣기는 보조)**. 이유: 상품 ID·쿠팡 URL·단축 URL로 조회하는 API가 없고(로그인 화면 확인 3), 키 발급은 최종 승인 회원만 되며(확인 2), API 키 위탁·데이터 저장이 약관과 충돌합니다. 붙여 넣는 코드는 iframe이거나 생성된 배너 이미지라 원본 사진·온전한 상품명을 확실히 얻지 못합니다(확인 5). 서버가 쿠팡에 요청하지 않아 부정 클릭·403·스크레이핑 문제가 없고, 링크는 크리에이터가 만든 추적 주소 그대로라 수익이 유지됩니다. 세부:
  - 링크가 `link.coupang.com`·`coupa.ng`이면 쿠팡 카드로 보고 대가성 문구를 자동 표시(사용자 결정의 "자동"은 이 판별로 충족).
  - `www.coupang.com/vp/products/…` 같은 일반 쿠팡 URL은 수익이 안 되는 주소라고 안내(저장 허용 여부는 사용자 결정).
  - 카드 사진은 크리에이터 업로드(기존 `thumbnail` 업로드 재사용). 사진이 없으면 기본 카드 모양.
  - 블로그용 태그를 붙여 넣으면 링크와 `alt`(상품명 후보)를 미리 채우고 크리에이터가 고침. 태그의 배너 이미지는 카드 사진으로 쓰지 않음(실제 생성물을 보고 다시 판단).
  - 가격은 표시하지 않음.
- 탈락: A(파트너스 API) — 조회 API 없음, 최종 승인 필요, 키 제3자 제공 금지(오픈 API 약관 제4조·운영정책 5)), 응답 저장 금지(제5조)·캐시 5분. 쿠팡과 서면 제휴를 맺는다면 다시 검토. B 단독 — 붙여 넣은 코드만으로는 카드 사진·이름을 확실히 채우지 못함. C 단독 — 가능하지만 D가 같은 비용에 이름 미리 채우기를 더함.
- 사용자 결정과의 차이: "링크를 전달하면 정보를 가져와 채운다"는 쿠팡 링크에서는 사진·이름까지 자동으로 채울 공식 경로가 없어 부분적으로만 가능합니다. 이 차이를 사용자가 받아들일지 확인이 필요합니다.
- 미정(사용자 결정 필요): [work item 0045](../work/orchestrator/0045-block-swipe-cards.md)의 질문 1~5.
- 반영 위치: 결정 후 PRD R5 등 요구 행과 기술 설계(`docs/specs/`). 이 문서는 PRD를 바꾸지 않습니다.

## 출처

- [쿠팡 파트너스 도움말 > 파트너스 API](https://partners.coupang.com/#help/open-api) — 가이드(키 발급 조건, HMAC 서명, 오류), 문서(경로 목록·호출 제한), Open API 가이드 V2, 자주 묻는 질문 탭
- [파트너스 API 명세 JSON(문서 탭 원본, Swagger 2.0)](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_SPEC) — 경로·매개변수·응답 모델(`Product`·`SearchProduct`·`ProductReco`·`DeepLinkBody`·`ShortenUrl`)
- [파트너스 API 가이드 원문](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_GUIDE) — 최종 승인 회원 제공, `Tools → 파트너스 API`, 서명 형식
- [Open API 가이드 V2 원문](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_V2_GUIDE) — 노출 측정, 캐시 만료(웹 5분·앱 60분), 응답 캐시·변조 금지, 분당 100회
- [파트너스 API FAQ 원문](https://partners.coupang.com/api/v1/configuration/content/OPEN_API_FAQ) — 무료, 키 재발급·삭제 불가, 품절 상품 미노출, 제한 도달 시 24시간 제한
- [쿠팡 파트너스 이용약관(오픈 API 서비스 이용 약관 포함)](https://partners.coupang.com/#help/terms) — 원문 https://partners.coupang.com/api/v1/configuration/content/TERMS 의 2026-09-07 적용본: 제5조 최소 지급 10,000원, 제8조 금지 행위, 오픈 API 약관 제4조·제5조·제6조
- [쿠팡 파트너스 운영정책](https://partners.coupang.com/#help/operating-policy) — 원문 https://partners.coupang.com/api/v1/configuration/content/OPERATING_POLICY 의 최신본: 1.3 최종승인, 4.1 기술적 금지 행위·무효클릭·광고미디어 권한 재판매, 제재 조치
- [쿠팡 파트너스 이용 가이드(2025-02)](https://partners.coupangcdn.com/partners-guide/partners-guide-20250206163324.pdf) — 상품 링크 URL/HTML 복사, 쿠팡 URL 그대로 복사 시 수익 미반영, 대가성 문구, 최종 승인과 API, 자동실행·무효 클릭 금지
- [쿠팡 파트너스 이용 가이드(2024-07)](https://partners.coupangcdn.com/partners-guide/partners-guide-20240711135620.pdf) — URL은 포스팅·HTML은 위젯, 옛 API 호출 제한과 위반 처리
- [아보느 티스토리: 쿠팡파트너스 상품 링크 예시(2019)](https://aboneu.tistory.com/42) — `a`+`img` 형식(잘린 `alt`)과 `iframe` 형식 예시
- [맥시멀리스트 잡학창고: 상품링크 HTML로 넣기(2021)](https://youngswooyoung.tistory.com/97) — 링크 생성 시 단축 URL과 HTML 코드가 함께 생성됨
- [Threads 게시물 예시(2026-05)](https://www.threads.com/@sheegae1/post/DYpCgpqCZCP) — `referrerpolicy="unsafe-url" browsingtopics`가 붙은 iframe 코드(검색 결과 요약으로 확인)
- [Facebook 게시물 예시](https://www.facebook.com/100003446397610/posts/26311928908505297) — `referrerpolicy="unsafe-url"` iframe 코드(검색 결과 요약으로 확인)
- [인프런 질문: 쿠팡 파트너스 최종 승인](https://www.inflearn.com/community/questions/170881) · [알뜰 송송 매거진: 최종승인과 API 활성화](https://mg.jnomy.com/coupang-partners-verify) — 블로그 보조 자료, 판매 15만 원 기준 인용
- [Kevinlee7250/cli PR #89](https://github.com/Kevinlee7250/cli/pull/89) — 쿠팡 HTML 배너 입력 검사 비교 사례
- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — 허용 목록·리디렉션·DNS rebinding·네트워크 격리
- [The Open Graph protocol](https://ogp.me/) — `og:title`·`og:image` 형식
- 직접 확인(2026-10-07 curl): `https://static.coupangcdn.com/image/affiliate/banner/35051f6de7f60a39c4b0e13618de64f1@2x.jpg` 응답 헤더(Referer 유무와 관계없이 200)
- 로그인 화면 확인(2026-10-07, 로그인 필요, 오케스트레이터가 사용자 계정으로 읽기만 함): https://partners.coupang.com/#affiliate/ws/link (상품 링크 3단계, `일반태그`·`블로그용 태그`), https://partners.coupang.com/#affiliate/ws/tools/open-api (최종 승인 회원만 발급, `생성` 비활성)
