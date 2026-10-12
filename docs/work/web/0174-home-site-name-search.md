# 0174 홈 검색 제목과 사이트 이름 구조화 데이터(동음 브랜드 구별)

- 단계: 티켓
- 역할: web
- 상태: 진행
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-12

## 목적

실사용자 100명 목표(PRD `목표`, R23)의 최대 병목은 외부 유입입니다(10/12 지표 방문 7일 3·실사용자 0). 계정 없이 가능한 검색 유입 경로를 보강합니다. 2026-10-12 PM Research 조사에서 `크리링` 검색 결과가 같은 이름의 만화 등장인물 문서로 채워지고 크리링 서비스 페이지는 보이지 않았습니다[관측: 웹 검색 1회, 검색엔진 미지정]. 홈 `<title>`도 `크리링` 한 단어라 검색 결과에서 서비스 종류를 알 수 없습니다.

사용자 위임(2026-10-10, ADR 0015)과 [AI 운영자 헌장](../../ops/ai-operator.md)에 따른 PM AI 승인입니다. 검색 노출·가입 효과는 미검증 가설입니다.

## 수용 기준

- [x] 홈(`/`) `<title>`이 `크리링 - 크리에이터 링크인바이오·포트폴리오 랜딩페이지`이고, 다른 페이지의 `%s | 크리링` 템플릿과 공개 랜딩 제목은 그대로입니다.
- [x] 홈에만 `WebSite` JSON-LD(`name` 크리링, `alternateName` Crelink·links.shaul.kr, `url` `https://links.shaul.kr/`)가 한 개 있고, 고정 상수라 사용자 입력이 섞이지 않으며 `<`를 이스케이프합니다([Google 사이트 이름 문서](https://developers.google.com/search/docs/appearance/site-names)).
- [x] 로그인 전 홈 화면 표시·`og:site_name`·OG 제목은 바뀌지 않습니다.
- [ ] main 머지·Deploy(운영 주소 검사) 뒤 운영 홈 HTML을 GET 1회로 확인합니다(홈은 방문 기록 대상 아님).

## 범위

- 포함: `apps/web/src/app/(public)/page.tsx` 메타데이터·JSON-LD, `apps/web/src/lib/site.ts` 상수.
- 제외: 공개 랜딩(`/p/`)·문서 페이지 구조화 데이터, 새 문서 페이지, 검색 등록(0148)·IndexNow 제출(0173), 화면 문구 변경.

## 측정

- 배포 시각을 T0로 기록합니다. 회사 Search Console 접근(0148)이 없어 검색 노출·클릭 수는 관측할 수 없습니다. 7일 뒤 전체 가입·첫 보이는 링크·실사용자만 관측하고 인과를 주장하지 않습니다.

## 위험·복구

검색 결과 사이트 이름 선택은 Google 자동 결정이며 보장되지 않습니다. 문제가 있으면 이 PR을 revert합니다. 데이터·API·인증 변경은 없습니다.

## 연결

- [PRD](../../product/crelink.md) `목표`
- [0141 검색·링크 미리보기 기본기](0141-search-and-link-preview-basics.md)
- 0173 IndexNow(미병합 [PR129](https://github.com/ai-worker-lab/crelink/pull/129))
- [0148 검색엔진 소유 확인](../orchestrator/0148-search-console-registration.md)

## 진행 기록

- 2026-10-12 PM `2dcd6487-da01-4141-a880-0438658ce7b1`: 당일 KST main 머지 9건으로 상한 도달이라 이번 실행은 구현·로컬 검증·PR까지 합니다. Research 새 근거: Google 사이트 이름 문서(홈 `WebSite` 구조화 데이터가 가장 중요, `alternateName`·소문자 도메인 대안 권장), `크리링` 검색 결과의 동음 문서 독점 관측.
