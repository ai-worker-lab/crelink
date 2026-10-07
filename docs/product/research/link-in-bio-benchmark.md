# 링크 인 바이오 유사 서비스 벤치마킹(인포크링크·인링크·리틀리)

- 확인일: 2026-10-07 (공개 페이지·도움말·요금 페이지·앱 스토어 기준, 로그인이 필요한 편집 화면은 보지 않음)
- 조사 질문: 인스타그램 크리에이터가 링크 페이지를 만들어 공유하고 방문자가 링크를 누르기까지, 세 서비스는 화면을 어떻게 구성했는가? 그중 크리링 MVP 화면(공개 랜딩, 링크 관리, 내 크리링)과 디자인 시스템에 옮길 만한 것은 무엇인가?
- 관련: [크리링 PRD](../crelink.md), 디자인 시스템 `design/system/DESIGN.md`, work item `docs/work/product/0041-link-in-bio-benchmark.md`

출처로 확인한 사실과 추론·제안을 구분합니다. 제안은 `[AI 제안]`으로 표시합니다. "공개 페이지 데이터"는 공개 링크 페이지 HTML에 포함된 JSON·JS를 읽어 확인한 값입니다. 서비스가 직접 쓴 블로그·비교 글은 자사 자료라는 점을 감안해 읽습니다. 작성 기준은 [제품 탐색과 PRD](../README.md#조사-품질-기준)를 따릅니다.

## 조사 대상

사용자가 지정한 세 서비스입니다. 인링크는 이제 링크 인 바이오 전문 서비스가 아니라 브랜드 협업(체험단·협찬) 플랫폼이고, 크리에이터 페이지(마이링크)는 그 안의 기능 하나입니다.

| 서비스 | 구분 | 대상 사용자 | 플랫폼 | 가격 모델 | 출처 |
| --- | --- | --- | --- | --- | --- |
| 인포크링크 | 직접 경쟁 | 인스타그램 크리에이터, 공동구매·제휴 수익을 내는 크리에이터 | 웹, iOS·Android 앱 | Basic 무료, Pro 월 5,900원, Manager 월 18,900원 | https://www.inpock.co.kr/plan |
| 인링크(마이링크) | 간접 경쟁(협업 플랫폼의 프로필 기능) | 협찬·체험단을 찾는 인플루언서, 그들을 찾는 브랜드 | 웹, iOS·Android 앱 | 인플루언서 무료, 수수료는 브랜드 부담 | https://inlink.to/for/influencer |
| 리틀리 | 직접 경쟁 | 크리에이터·프리랜서·소상공인 등 범용 | 웹 | 무료, 프로 월 2,450원·브랜드 월 9,450원(연 결제 기준) | https://start.litt.ly/plan |

규모 표기(사이트 문구 그대로, 시점·기준이 달라 비교용으로 쓰지 않음): 인포크 "40만 크리에이터"(App Store 설명은 "30만"), 인링크 인플루언서 가입자 137,749명, 리틀리 회원 40만 명(2026년 5월 자사 블로그는 36만 명).

## 기능 비교

| 기능 | 인포크링크 | 인링크 마이링크 | 리틀리 | 크리링 PRD |
| --- | --- | --- | --- | --- |
| 페이지 구성 방식 | 블록을 직접 조립 | 입력한 프로필 데이터로 자동 구성, 구역을 켜고 끔 | 블록을 직접 조립 | 고정 구성(프로필·SNS·리스트형 링크 구역 1개·포트폴리오) R5·R12 |
| 링크 표시 | simple / thumbnail 두 형태 | 외부 링크 추가 가능(예시 페이지에는 없음) | largeCard / smallButton, 강조 표시 | 리스트형, 파비콘 자동·썸네일·설명 선택 R5 |
| 그 밖의 블록 | 이미지, 동영상, 텍스트, 구분선, 컬렉션(2·3열), 캘린더, 검색창 | 메뉴판, 상품, 협업 이력, 리뷰, 방명록 | 50종 이상(상품, 동영상, 음악, 갤러리, 지도, 후원, 구독, 문의, 일정 등) | 없음(이후 버전) R5 |
| 숨기기 | 블록별 공개 여부·공개 기간(예약은 Pro) | 구역별 켜기, 포트폴리오 항목별 노출 스위치 | 블록별 켜기 | 링크별 숨기기 토글 R4·R18 |
| 순서 변경 | 확인 못 함 | 구역은 손잡이로 끌기, 포트폴리오는 최신순 고정 | 끌어서 놓기, 오른쪽 미리보기에 바로 반영 | 끌어서 놓기·키보드 R18 |
| 꾸미기 | 레이아웃 2종, 블록 모양 3종, 그림자 3단계, 배경, 폰트 6종, 스티커(Pro) | 포인트 색, 글꼴, 배경, 모서리 | 템플릿, 배경, 버튼 색·모양·클릭 효과, 폰트, 로고, AI 추천 디자인 | 없음(크리링 디자인 시스템 한 가지) |
| 주소 | link.inpock.co.kr/아이디, 간단 주소는 Pro | 12345.inlink.to → 영소문자·숫자·`-` 3~30자, 첫 변경 뒤 30일 1회 | litt.ly/이름, 커스텀 도메인은 브랜드 플랜 | 단축 URL 자동 발급, 인링크와 같은 변경 규칙 + 옛 주소 90일 연결 R8 |
| 공유 | 주소 복사 | 복사, QR 다운로드 | 공유 버튼(공개 페이지 기본 켜짐), QR | 단축 URL 확인·복사 R1 |
| 통계(크리에이터에게) | Basic 방문자 요약, Pro 클릭·유입·요일/시간대 | 7·30·90일 조회·클릭·CTR·순 방문자·링크별·유입 Top 5·기기·활동 로그 | 무료 실시간 방문자·유입·클릭·국가, 프로 기간별·내보내기·GA4·픽셀 | 크리에이터에게 보여 주지 않음(운영자만) R10 |
| 수익화 | 스마트스토어, 쿠팡 파트너스, 공동구매, 브랜드 제안, 알림톡·DM 자동화 | 캠페인 지원, 브랜드 제안, 마켓 판매 | 디지털·실물·재능 판매, 후원, 멤버십, 예약 | 없음(MVP 제외) |
| 서비스 표시 | 확인 못 함 | 페이지 아래 "Powered by inlink.to" | 하단 로고, 프로 플랜에서 제거 | 아래쪽 "크리링으로 만든 페이지"(DESIGN.md) |

출처: 인포크 https://www.inpock.co.kr/link , https://blog.inpock.co.kr/guide-getting-started-style-guide/ , https://blog.inpock.co.kr/inpokplan/ , https://link.inpock.co.kr/poong__e · 인링크 https://inlink.to/help/article/setup-mylink , https://inlink.to/help/article/manage-portfolio , https://inlink.to/help/article/public-profile , https://inlink.to/10959 · 리틀리 https://start.litt.ly/feature/design-blocks , https://start.litt.ly/feature/analytics , https://start.litt.ly/feature/monetization-blocks , https://start.litt.ly/solution/profile-link

## 핵심 흐름과 UX 패턴

### 처음 만들기

- 인포크: 공식 가이드 순서가 ① 디자인 설정(레이아웃·배경색) → ② 관리자 페이지에서 블록 설정 → ③ 관리자 페이지에서 아이디를 눌러 주소 복사입니다. 모바일·노트북 어디서나 편집한다고 안내합니다. https://blog.inpock.co.kr/guide-getting-started-1/
- 인링크: 가입하면 마이링크가 자동으로 만들어지고, 프로필·SNS 채널을 연동한 뒤 첫 캠페인에 지원하는 흐름입니다. 사진·소개·SNS·포트폴리오는 별도 편집 없이 마이페이지 입력값으로 채워진다고 도움말에 적혀 있습니다. 인플루언서 소개 페이지의 예시 화면에는 '마이링크 편집'에서 구역을 켜고 끄고 손잡이로 순서를 바꾸는 모습이 있어, 도움말과 소개 페이지 설명이 다릅니다. https://inlink.to/help/article/influencer-getting-started , https://inlink.to/for/influencer
- 리틀리: 블록을 추가하고 끌어서 순서를 바꾸면 오른쪽 미리보기에 바로 반영된다고 자사 블로그에 적혀 있습니다. 새 페이지에는 링크와 상품 링크 블록이 기본으로 들어갑니다. https://start.litt.ly/blog/insta-profile-link-services-comparison-2026

### 방문자가 보는 공개 페이지

- 세 서비스 모두 휴대폰 세로 한 열입니다. 위에 프로필(사진·이름·소개)이 오고 아래로 블록·구역이 이어집니다.
- 인포크 예시 세 페이지는 SNS 아이콘이 모두 아래쪽(`bottom`)에 있었고, 맨 위 링크에 스티커를 붙여 눈에 띄게 한 페이지가 있었습니다. https://link.inpock.co.kr/deelisa
- 인링크 마이링크는 아바타·닉네임·평점 → 소개 → 제안하기·메시지 보내기·포인트 선물하기 버튼 → 포트폴리오 → SNS 채널(팔로워·참여율) → 분야 TOP3 → 숏폼·게시물 → 협업 이력 → 받은 리뷰 → 방명록 순서였습니다. 크리에이터 콘텐츠보다 브랜드가 평가하는 정보가 많습니다. https://inlink.to/10959
- 리틀리 예시는 배경 이미지·큰 카드형 링크·동영상·음악·후원처럼 블록이 다양했고, 링크 하나를 강조 표시(`emphasized`)한 페이지가 있었습니다. 공유·구독 버튼이 기본으로 켜져 있습니다. https://litt.ly/zoee , https://litt.ly/tovmusic

### 시각 스타일

| 항목 | 인포크링크 | 인링크 | 리틀리 |
| --- | --- | --- | --- |
| 글꼴 | Pretendard(사이트·공개 페이지 기본) | Pretendard | 사이트 Pretendard JP, 공개 페이지 기본 SUIT |
| 공개 페이지 기본 바탕 | 흰색 | 옅은 파랑에서 흰색으로 그라데이션 | 아주 옅은 회색 |
| 모서리 | 기본 12px, 0·알약형 선택 | 카드 둥글게(rounded-2xl) | 버튼 기본 14px, 0·30px 선택 |
| 주 색(사이트) | 주황 알약형 버튼 | 파랑 | 검정 버튼, 파랑 보조 |

근거는 각 사이트와 예시 공개 페이지의 CSS·JS 값(2026-10-07 수집)입니다: https://www.inpock.co.kr/ , https://link.inpock.co.kr/poong__e , https://inlink.to/ , https://start.litt.ly/ , https://litt.ly/zoee

### 재방문 장치

- 인링크는 이번 주 방문자가 있으면 관리 화면 위에 "이번 주 N명이 내 마이링크를 봤어요"를 보여 줍니다. https://inlink.to/help/article/setup-mylink
- 인포크는 Pro에 데일리 요약 통계와 알림톡 예약 발송이 있습니다. https://www.inpock.co.kr/plan

## 사용자 평가

| 서비스 | 평점 | 반복되는 불만 | 칭찬 |
| --- | --- | --- | --- |
| 인포크링크 앱 | App Store 3.38(21건), Google Play 3.4(25건) | iOS 최근 리뷰 9건 중 5건이 흰 화면·느림·멈춤, Play 노출 리뷰 3건 중 2건이 이미지 업로드 실패, 정산 지연·구독 결제 문의 | 속도·업데이트 칭찬 각 1건 |
| 인링크 앱 | App Store 3.24(41건), Google Play 3.33(44건) | App Store 최근 21건 중 10건 이상이 애플·네이버 로그인 오류, 리뉴얼 뒤 포인트·캠페인이 안 보임, 보증금제 불만 | 1건 |
| 리틀리 | 네이티브 앱을 찾지 못함 | 확인 못 함 | 확인 못 함 |

출처: https://apps.apple.com/kr/app/id6744309305 , App Store·Google Play 각 서비스 상세 페이지(2026-10-07 열람). 리뷰 수가 적어 경향 참고용입니다.

## 사업·운영 측면

- 인포크는 꾸미기(스티커)·간단 주소·통계 확장·광고 제거를 Pro(월 5,900원)로, 인스타그램 DM 자동화를 Manager(월 18,900원)로 팝니다. https://www.inpock.co.kr/plan
- 리틀리는 판매 수수료 1~5%(누적 결제가 많을수록 낮아짐)와 구독(로고 제거·데이터·페이지 수·커스텀 도메인)으로 법니다. 해지·다운그레이드 시 10% 위약 수수료를 뗀다고 안내합니다. https://start.litt.ly/feature/monetization-blocks , https://start.litt.ly/plan
- 인링크는 인플루언서 무료, 캠페인 수수료를 브랜드가 냅니다. https://inlink.to/for/influencer
- 세 서비스 모두 서비스 이름을 공개 페이지 아래에 두고, 리틀리는 유료에서 지울 수 있게 합니다. 크리링 PRD R6·R13의 유료 항목(단축 URL n개, 링크 슬롯)과 겹치는 과금 단위는 없습니다.

## 결론

### 따라 할 것

- [AI 제안] 공개 랜딩은 지금 PRD 구성(프로필 → SNS → 링크 → 포트폴리오)을 유지합니다. 세 서비스 모두 프로필을 맨 위에 둔 세로 한 열이고, 크리링 DESIGN.md의 "크리에이터가 주인공" 방향과 같습니다.
- [AI 제안] 링크 카드는 두 형태를 같은 카드 안에서 소화합니다. 썸네일이 없으면 파비콘과 제목만, 있으면 왼쪽 썸네일입니다. 인포크 simple/thumbnail, 리틀리 smallButton/largeCard와 같은 구분이며 R5 수용 기준 ④⑤와 맞습니다. 별도 표시 종류를 고르는 화면은 두지 않습니다.
- [AI 제안] 링크별 숨기기와 끌기 정렬은 세 서비스 모두 갖춘 기본기라, R18대로 관리 화면 한 곳에서 제공합니다.
- [AI 제안] 공개 랜딩 맨 아래의 "크리링으로 만든 페이지" 한 줄은 업계 관행과 같습니다. 이후 유료에서 지울지는 사업 결정입니다.
- [AI 제안] 업로드·불러오기 실패 상태를 먼저 다듬습니다. 두 앱 리뷰의 불만 상당수가 흰 화면·이미지 업로드 실패·로그인 오류였습니다. 크리링 프로필 사진·썸네일·포트폴리오 이미지 업로드에 실패 이유와 다시 시도 행동을 반드시 보여 줍니다(DESIGN.md "모든 화면은 로딩·성공·빈 상태·오류").

### 피할 것

- [AI 제안] 공개 페이지에 플랫폼 행동 버튼을 늘어놓지 않습니다. 인링크 마이링크는 제안·메시지·포인트 선물 버튼과 평점·팔로워·리뷰가 앞에 와서 방문자가 크리에이터 링크까지 내려가야 합니다.
- [AI 제안] 꾸미기 선택지를 MVP에 넣지 않습니다. 인포크·리틀리는 폰트 6종 이상·버튼 모양·배경 이미지·스티커를 주지만, 크리링은 디자인 시스템 한 가지로 시작한다는 기존 결정(0020)을 유지합니다.
- [AI 제안] 배경 이미지 위에 어두운 덮개를 씌우는 방식(인포크)은 대비 확인이 어렵고 SNS 공식 아이콘 색과 다툴 수 있어 쓰지 않습니다.

### 차별화 기회

- [AI 제안] 무료 단축 주소와 그 방문 데이터. 인포크는 간단 주소가 유료이고, 크리링은 단축 URL을 기본 제공하며(R6) 모든 외부 진입을 단축 주소로 기록합니다(R7). 공유 화면에서 "이 주소를 인스타그램 프로필에 넣으세요"를 가장 먼저 보여 주는 것이 크리링다운 첫 경험입니다.
- [AI 제안] 군더더기 없는 랜딩. 세 서비스 모두 블록이 늘면서 페이지가 길고 다양해졌습니다. 크리링은 리스트형 한 구역으로 "누를 곳이 분명한 페이지"를 강점으로 삼을 수 있습니다.

### 사용자 결정(2026-10-07)

조사 당시 미정이던 다섯 가지를 사용자가 정했습니다. 모두 MVP 범위를 넓히지 않는 쪽입니다.

| 항목 | 결정 |
| --- | --- |
| 내 크리링 주소 옆 QR 다운로드 | 이후 버전 |
| 공개 랜딩의 방문자용 공유 버튼(단축 주소 복사) | 이후 버전. 넣을 때는 R7에 따라 단축 주소를 복사 |
| 링크 하나 강조 표시 | 이후 버전, 강조색 카드로 표현 |
| 크리에이터에게 방문 수 보여 주기 | 보여 주지 않음. R10 유지(운영자만 조회) |
| 크리에이터 테마(색·글꼴·모서리) 선택 | MVP는 크리링 디자인 한 가지 유지 |

### 반영 위치

- 이후 버전으로 미룬 QR·방문자 공유 버튼·링크 강조·크리에이터 테마는 [PRD 범위](../crelink.md#범위)의 MVP 제외 항목에 적었습니다.
- R10과 디자인 시스템 `design/system/DESIGN.md`는 바뀌지 않습니다. 위 `따라 할 것`·`피할 것`은 현재 PRD·디자인 시스템과 같은 방향이라 별도 변경 없이 웹 반영 작업의 참고로 씁니다.

## 출처

- https://www.inpock.co.kr/ — 인포크 포지셔닝 카피, 사이트 글꼴·버튼 스타일
- https://www.inpock.co.kr/link — 인포크링크 기능 소개
- https://www.inpock.co.kr/plan — 인포크 요금제와 기능 차이
- https://blog.inpock.co.kr/guide-getting-started-1/ — 인포크링크 시작 순서
- https://blog.inpock.co.kr/guide-getting-started-style-guide/ — 레이아웃·블록·꾸미기 항목
- https://blog.inpock.co.kr/guide-getting-started-statistics/ — 통계 항목
- https://blog.inpock.co.kr/inpokplan/ — 요금제 안내, 블록 예약
- https://link.inpock.co.kr/poong__e , https://link.inpock.co.kr/deelisa , https://link.inpock.co.kr/salim_nam — 인포크 공개 페이지 예시(구성·스타일 값)
- https://apps.apple.com/kr/app/id6744309305 — 인포크 App Store 설명·평점
- https://inlink.to/ — 인링크 포지셔닝, 사이트 스타일 값
- https://inlink.to/for/influencer — 인플루언서 대상 소개, 마이링크 편집 예시 화면, 규모 수치
- https://inlink.to/help/article/setup-mylink — 마이링크 구성, 주소 규칙, 복사·QR, 통계
- https://inlink.to/help/article/manage-portfolio — 포트폴리오 항목·노출 스위치·정렬
- https://inlink.to/help/article/public-profile — 공개 프로필 구성, 공유
- https://inlink.to/help/article/influencer-getting-started — 시작 흐름
- https://inlink.to/10959 , https://inlink.to/113567 — 마이링크 공개 페이지 예시
- https://start.litt.ly/ — 리틀리 포지셔닝 카피, 규모 수치, 사이트 스타일 값
- https://start.litt.ly/plan — 리틀리 요금제
- https://start.litt.ly/feature/design-blocks — 디자인 꾸미기 항목
- https://start.litt.ly/feature/analytics — 통계 항목
- https://start.litt.ly/feature/monetization-blocks — 판매·수수료
- https://start.litt.ly/solution/profile-link — 주소·QR
- https://start.litt.ly/blog/insta-profile-link-services-comparison-2026 — 편집 방식(리틀리 자사 비교 글)
- https://start.litt.ly/blog/linktree-alternative-littly-2026 — 2026년 5월 규모 수치(자사 글)
- https://litt.ly/zoee , https://litt.ly/tovmusic , https://litt.ly/serene — 리틀리 공개 페이지 예시
