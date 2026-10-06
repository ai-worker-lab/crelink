# SNS 채널 아이콘

랜딩페이지 SNS 채널 줄과 `/me` SNS 편집 행의 플랫폼 아이콘입니다(PRD R12). 자산은 [`public/icons/sns/`](../public/icons/sns/)에 플랫폼 값(`SocialPlatform`)과 같은 이름의 SVG로 두고, [`SocialIcon`](../src/components/SocialIcon.tsx)이 CSS `mask`로 그려 글자색(디자인 토큰)을 따릅니다. 플랫폼 이름·자산 경로의 기준은 [`src/lib/format.ts`](../src/lib/format.ts)의 `SOCIAL_PLATFORM_LABELS`입니다.

- 확인일: 2026-10-06

## 출처

SVG는 [Simple Icons](https://simpleicons.org/) 16.34.0(`simple-icons` npm, 데이터 라이선스 CC0-1.0)에서 가져왔습니다. Simple Icons는 아이콘마다 브랜드 공식 자료를 출처로 기록하며, 아래 `공식 출처`·`브랜드 가이드라인`은 그 기록(`data/simple-icons.json`)입니다. 로고·이름의 상표권은 각 회사에 있습니다(Simple Icons [DISCLAIMER](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)).

| 플랫폼 | 파일 | Simple Icons 아이콘 | 공식 출처 | 브랜드 가이드라인 |
| --- | --- | --- | --- | --- |
| 인스타그램 | `instagram.svg` | Instagram | [Meta 브랜드 자료](https://about.meta.com/brand/resources/instagram) | 같은 페이지 |
| 유튜브 | `youtube.svg` | YouTube | [YouTube 브랜드 자료](https://www.youtube.com/howyoutubeworks/resources/brand-resources/#logos-icons-and-colors) | 같은 페이지 |
| 틱톡 | `tiktok.svg` | TikTok | [tiktok.com](https://tiktok.com) | 기록 없음 |
| 네이버 블로그 | `naver_blog.svg` | Naver | [네이버 로그인 BI](https://developers.naver.com/docs/login/bi/bi.md) | 같은 페이지 |
| X | `x.svg` | X | [x.com](https://x.com) | [X 브랜드 툴킷](https://about.x.com/en/who-we-are/brand-toolkit) |
| 스레드 | `threads.svg` | Threads | [Meta 브랜드 자료](https://www.meta.com/brand/resources/instagram/threads) | 같은 페이지 |
| 페이스북 | `facebook.svg` | Facebook | [Meta 브랜드 자료](https://about.meta.com/brand/resources/facebook/logo) | 같은 페이지 |
| 기타 | `other.svg` | 없음 | 크리링 자체 링크 아이콘(웹 기본 링크 아이콘과 같은 모양) | — |

## 사용 규칙

- 단색(현재 글자색)으로만 씁니다. 각 가이드라인이 허용하는 흑백 단색 사용 범위이며, 모양을 바꾸거나 자르거나 다른 요소와 합치지 않습니다.
- 아이콘은 장식(`aria-hidden`)이고, 플랫폼 이름은 링크 안의 숨김 텍스트가 제공합니다.
- 네이버 블로그는 Simple Icons에 블로그 전용 아이콘이 없어 네이버 로고(N)를 씁니다. 네이버 블로그 고유 로고로 바꾸려면 네이버의 공식 블로그 BI 자료를 확인한 뒤 이 표와 파일을 함께 바꿉니다.
- 아이콘을 바꾸거나 플랫폼을 더하면 `SOCIAL_PLATFORM_LABELS`, 이 표, [외부 의존](../../../docs/architecture/external-dependencies.md)을 같은 변경에서 고칩니다.
