---
name: product-discovery
description: PRD를 확정하기 전 유사 서비스 벤치마킹과 라이브러리·오픈소스·SaaS 기술 조사를 할 때 읽는다. 조사 대상 선정, 수집 방법(웹 검색, npm·GitHub·OSV·React Native Directory), 평가 기준, 문서 위치와 결론 작성법.
---

# 제품 탐색 조사 절차

흐름, 문서 위치, 품질 기준은 `docs/product/README.md`가 기준입니다. 이 스킬은 그 안에서 조사하는 방법입니다. 조사 결과는 근거이고, 범위·우선순위·기술 선택은 사용자가 정합니다.

## 시작 전

1. 맡은 work item에서 조사 질문과 끝낼 조건을 확인합니다. 없으면 티켓 `진행 기록`에 질문 3~5개와 끝낼 조건을 먼저 적습니다.
2. 기존 문서를 먼저 찾습니다: `docs/product/`, `docs/product/research/`, `docs/references/`, 관련 ADR, 그리고 `docs/product/README.md` 문서 위치 표가 연결한 기존 문서. 확인일이 90일보다 오래된 문서는 바뀔 수 있는 사실(가격·라이선스·유지보수 상태)을 다시 확인합니다.
3. 저장소에 이 절차와 다른 위치의 조사 문서나 다른 이름의 PRD(예: `docs/product/requirements.md`)가 이미 있으면 옮기거나 이름을 바꾸지 않습니다. 그 문서를 고쳐 쓰고, `docs/product/README.md` 표에 연결되어 있지 않으면 연결합니다. 새 문서만 아래 위치를 따릅니다.

## 유사 서비스 벤치마킹 (`product`)

- **대상 고르기**: 직접 경쟁(같은 문제·같은 사용자) 3개 이상, 간접 경쟁(같은 문제·다른 방식), 대체 수단(스프레드시트·메신저·종이 등)을 포함합니다. 서비스 언어가 한국어이므로 국내 서비스와 해외 대표 서비스를 함께 봅니다.
- **수집**: `web_search`로 찾고(`after:` 날짜, `site:` 필터), 공식 사이트·도움말·가격 페이지·변경 기록을 `read`로 읽습니다. 사용자 평가는 앱 스토어 리뷰, 커뮤니티, 리뷰 사이트에서 반복되는 내용만 빈도와 함께 적습니다. 로그인·결제가 필요한 화면은 공개 자료(도움말, 소개 영상, 블로그)로 대신하고 그 한계를 적습니다.
- **볼 것**: 대상 사용자, 핵심 기능, 첫 가치까지의 흐름(온보딩), 재방문 장치(알림·추천), 가격·수익 모델, 데이터·개인정보 처리, 반복되는 불만.
- **디자인 참고**: 화면 흐름 참고가 필요하면 `designer`에게 넘길 링크를 남깁니다. 시각 스타일 추출은 디자인 작업(`opendesign` 스킬의 `brand-extract`, `reference-design-contract`)에서 합니다.
- **문서**: `docs/product/research/<주제>.md`(템플릿: `docs/product/research/TEMPLATE.md`). 결론은 따라 할 것·피할 것·차별화 기회·미정으로 끝냅니다.

## 기술 조사 (`orchestrator`, 영역 agent 확인)

PRD 초안의 핵심 기능마다 후보 2개 이상과 "직접 만들기"를 비교합니다.

| 기준 | 확인 방법 |
| --- | --- |
| 기능 적합 | 공식 문서·예제가 요구 조건을 만족하는지 |
| 스택 적합 | NestJS(서버), Next.js App Router(서버 컴포넌트·Edge 여부), Expo SDK·React Native New Architecture·Expo Go 지원(`https://reactnative.directory/api/libraries?search=<이름>`), PostgreSQL. 필요하면 영역 agent에 임시 디렉터리에서 설치·예제 실행을 맡깁니다 |
| 라이선스 | `npm view <pkg> license`, 저장소 LICENSE. AGPL·SSPL·BSL·Commons Clause·"source-available"은 서비스 제공 방식과 함께 위험으로 표시 |
| 유지보수 | `npm view <pkg> version time.modified`, `gh api repos/<owner>/<repo>`(`pushed_at`, `open_issues`), 최근 릴리스 간격, 메인테이너 수 |
| 채택도 | `https://api.npmjs.org/downloads/point/last-week/<pkg>`, 스타, 공개 사용 사례 |
| 보안 | `https://api.osv.dev/v1/query`에 `{"package":{"name":"<pkg>","ecosystem":"npm"},"version":"<버전>"}` POST, GitHub Security Advisories |
| 비용·운영 | SaaS 무료 한도·사용량 과금, 셀프 호스팅 운영 부담(인프라 구성, 백업) |
| 잠김·탈출 | 데이터 내보내기, 표준 프로토콜 여부, 대체할 때 바꿔야 할 코드 범위 |

- **문서**: `docs/references/<주제>.md`(템플릿: `docs/references/TEMPLATE.md`). 추천은 `[AI 제안]`으로 표시하고 탈락 이유를 남깁니다.
- **결정**: 장기 선택이면 범위에 맞는 ADR을 `상태: 제안`으로 쓰고 조사 문서를 링크합니다. 사용자 확인 후에만 `승인`으로 바꿉니다. 의존성 설치는 해당 구현 티켓에서 합니다.

## 끝내기

1. 모든 사실에 출처 링크, 문서 머리에 `- 확인일: YYYY-MM-DD`를 둡니다. `pnpm docs:check`가 확인합니다.
2. PRD 초안(`docs/product/TEMPLATE.md`)의 `유사 서비스에서 얻은 것`·`기술 방향`에 결론을 요약하고 링크합니다. 요구마다 `[사용자 확정]`·`[AI 제안]`·`[미정]`을 붙입니다.
3. 사용자에게 결정할 질문을 선택지와 근거로 정리해 보고합니다. 답을 받기 전에는 구현 티켓을 `준비`로 올리지 않습니다.
4. 조사 중 발견한 범위 밖 일은 `분류 대기`·`(AI 제안)` work item으로 등록합니다.
