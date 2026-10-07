# SNS 채널 아이콘

랜딩페이지 SNS 채널 줄과 `/me` SNS 편집 행의 플랫폼 아이콘입니다(PRD R12). 각 서비스가 공식 브랜드 자료로 배포하는 아이콘 파일을 원본 색 그대로 [`public/icons/sns/`](../public/icons/sns/)에 두고, [`SocialIcon`](../src/components/SocialIcon.tsx)이 `<img>`로 보여 줍니다. 플랫폼 이름·파일 경로의 기준은 [`src/lib/format.ts`](../src/lib/format.ts)의 `SOCIAL_PLATFORM_LABELS`입니다.

- 확인일: 2026-10-06

## 디자인 시스템 적용 제외

SNS 브랜드 아이콘은 크리링 디자인 시스템(토큰·글자색·테마·모서리)을 적용하지 않습니다. 각 서비스 브랜드 검수에서 색·형태 변경이 문제가 되기 때문입니다(사용자 결정, 2026-10-06).

- 색·모양을 바꾸지 않습니다: `filter`·`opacity`·`mask`·`currentColor`·`clip-path`·`border-radius`·그림자·테두리를 아이콘에 적용하지 않습니다. 인라인 `<svg>`가 아니라 `<img>`로 써서 CSS가 파일 색을 덮어쓰지 못하게 합니다.
- 크기·타일 배경은 아래 가이드라인 값을 `styles.css`의 `.social-icon--{platform}`에 고정값으로 둡니다(디자인 토큰 아님). 새 디자인 시스템(0020)이 들어와도 이 값은 바꾸지 않습니다.
- 예외: 플랫폼이 `other`(기타)일 때의 링크 아이콘은 크리링 자체 아이콘이라 디자인 시스템 글자색을 따릅니다.

## 자산과 출처

모든 파일은 공식 브랜드 자료에서 받은 원본입니다(크기만 줄인 경우는 표에 표시). 다운로드 링크는 서명·만료형이 많아 브랜드 페이지의 다운로드 버튼에서 다시 받습니다.

| 플랫폼 | 파일 | 원본 | 공식 출처(브랜드 페이지) | 표시 규칙 |
| --- | --- | --- | --- | --- |
| 인스타그램 | `instagram.png` 512×512 투명 | 공식 팩 `01 Static Glyph/01 Gradient Glyph`의 그라디언트 글리프(5000px)를 비율만 유지해 축소. 공식 SVG는 래스터를 담은 10.9MB라 쓰지 않음 | [Meta 브랜드 자료](https://www.meta.com/brand/resources/instagram/instagram-brand/), 글리프 가이드는 [보관본](https://web.archive.org/web/20251207050207/https://www.meta.com/brand/resources/instagram/icons/) | 글리프 29px 이상, 사방 여백 글리프 크기의 1/2, 소셜 아이콘 줄에서 CTA 없이 사용 가능 |
| 유튜브 | `youtube.png` 1255×1075 투명 | 공식 `YouTube_Icon/Digital/01 Red/yt_icon_red_digital.png` 그대로(`#FF0033` 몸통, 흰 삼각형) | [YouTube 브랜드 자료](https://brand.youtube/youtube-icon) · [개발자 브랜딩 지침](https://developers.google.com/youtube/terms/branding-guidelines) | 파일 안에 공식 여백 포함. 소셜 아이콘 줄에서는 로고가 아니라 아이콘을 쓰고 YouTube 콘텐츠로 연결 |
| 틱톡 | `tiktok.svg` 800×800 | 공식 Social Icons `CIRCLE_WHITE`(검정 원 안에 흰 노트, Glint·Blaze 겹침) 그대로 | [TikTok Brand Hub](https://www.tiktokbrandhub.com/visual-identity/logo) · [다운로드](https://www.tiktokbrandhub.com/downloads) · [법적 조건](https://www.tiktokbrandhub.com/legal) | 노트 최소 너비 30px, 여백 노트의 35%. **로고·아이콘 사용은 TikTok의 사전 서면 허가가 필요하다고 명시됨(아래 위험)** |
| 네이버 블로그 | `naver_blog.png` 192×192 | 네이버 블로그 서비스가 쓰는 현행(2025-09 BI) 공식 웹 아이콘 `https://ssl.pstatic.net/static/blog/icon/blog_Icon_192x192.png`(검정 바탕에 초록 `b\|`) | [네이버 블로그팀 BI 소개](https://blog.naver.com/blogpeople/223999413544) · [NAVER 브랜드 리소스](https://www.navercorp.com/company/brandGuide) | 색·비율·효과 변경 금지, 가시성 낮은 배경 금지. 블로그 전용 배포 키트는 없음(아래 위험) |
| X | `x.svg` 1200×1227, 흰색 | 공식 `x-logo.zip`의 `logo.svg` 그대로 | [X 브랜드 툴킷](https://about.x.com/en/who-we-are/brand-toolkit) · [가이드라인 PDF](https://about.x.com/content/dam/about-twitter/x/brand-toolkit/x-brand-guidelines.pdf) | 로고는 흑·백만. 디지털에서 흰 로고는 `#000000` 배경 위(가이드 p.3·p.5). 그래서 `.social-icon--x`가 검정 타일을 깜 |
| 스레드 | `threads.svg` 977×1082, 검정 | 공식 Logo pack `02 Black/Logo/threads-logo-black.svg` 그대로 | [Threads 브랜드 자료](https://www.meta.com/brand/resources/instagram/threads/) | 공식은 흑·백뿐(컬러 없음). 검정 로고는 흰 배경 위. 그래서 `.social-icon--threads`가 흰 타일을 깜. 여백은 아이콘 너비의 1/4 |
| 페이스북 | `facebook.png` 2084×2084 투명 | 공식 Logo pack `Primary Logo/Facebook_Logo_Primary.png` 그대로(`#0866FF` 원, 흰 f). 공식 SVG 없음 | [Meta 브랜드 자료](https://www.meta.com/brand/resources/facebook/logo/) | 디지털 최소 16px, 여백 로고 너비의 1/4. 'f' 로고로 자기 Facebook 페이지로 안내하는 용도 허용(FAQ) |
| 기타 | `other.svg` | 크리링 자체 링크 아이콘 | — | 디자인 시스템 글자색을 따름 |

공통 조건: Meta(인스타그램·스레드·페이스북)는 다운로드 시 가이드라인·이용 조건에 동의하며, 방송·라디오·옥외·A4 초과 인쇄물이 아니면 별도 허가가 필요 없고, 제휴·보증을 암시하지 않아야 합니다. 각 회사의 허가는 언제든 철회될 수 있습니다.

## 사용 규칙

- 아이콘은 장식(`aria-hidden`)이고 플랫폼 이름은 링크 안 숨김 텍스트가 제공합니다.
- 어두운 배경에서도 아이콘 자체나 가이드가 허용하는 타일(위 X·스레드)로만 대비를 확보합니다. 임의의 흰/밝은 타일을 깔지 않습니다.
- 아이콘을 바꾸거나 플랫폼을 더하면 `SOCIAL_PLATFORM_LABELS`, `.social-icon--{platform}`, 이 표, [외부 의존](../../../docs/architecture/external-dependencies.md)을 같은 변경에서 고칩니다.
- 파일을 크리에이터·제3자에게 다운로드 자료로 제공하지 않습니다(네이버 로고 사용 유의사항).

## 남은 위험(검수 전 확인)

- **틱톡**: Brand Hub 법적 조건이 "로고·아이콘·심벌은 사전 서면 허가 없이 쓸 수 없다"고 하고, '소셜 링크 아이콘은 예외'라는 문구는 찾지 못했습니다. 공식 Social Icons 자산이 따로 제공되는 점으로 용도는 전제된 것으로 보이나 명시되지는 않았습니다(추정). 출시 전 TikTok에 서면 확인(또는 허가)을 받는 것을 권합니다. 또 노트 최소 너비 30px 규칙을 아이콘 전체에 적용하면 아이콘이 56px 이상이어야 해 현재 56px로 표시합니다(추정 해석).
- **네이버 블로그**: 공식 블로그 BI 배포 키트(SVG·가이드)를 찾지 못했고, 현재 파일은 블로그 서비스가 쓰는 공식 웹 아이콘(PNG 192px)입니다. 개발자센터에서 받을 수 있는 블로그 아이콘은 2015년 구 BI라 쓰지 않았습니다. 네이버 로그인용 N 아이콘은 로그인 버튼 전용이라 대체로 쓸 수 없습니다. 검수가 걱정되면 네이버(제휴 문의)에 확인이 필요합니다.
- **X**: 가이드는 2023-08 v1.0이고, 현재 툴킷 페이지 응답이 옛 트위터 자료를 내려 주어 이 SVG는 `about.x.com`의 `x-logo.zip`에서 직접 받았습니다. 최소 크기·여백 수치와 소셜 링크 아이콘 용도의 명시적 허용 문구는 없습니다.
- **인스타그램**: 공식 SVG가 래스터라 PNG를 축소했습니다(디자인 변경 없음). 그라디언트 글리프를 어두운 배경에 둘 때의 공식 규칙은 없습니다(공식 흰 글리프로 바꾸는 방법이 있음).
- **스레드**: 공식 최소 크기 수치와 컬러 버전이 없습니다. 다크 배경용 공식 흰 버전(`threads-logo-white.svg`)은 저장소에 두지 않았습니다.
- **페이스북**: 공식 PNG가 2084px·54KB로 작은 아이콘에는 큽니다(원본 유지를 위해 줄이지 않음).
