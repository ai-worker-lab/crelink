# 크리링 방문자 행동 수집 확장

> 2026-11-06 후속: 아래는 수집 1차의 범위다. 사용자 명시 요청으로 R10의 조회 권한을 확대하고 지표·통계 화면을 구현하는 현재 기준은 [조회 설계](crelink-analytics.md)다.


- 상태: 검토
- 작성일: 2026-11-05
- 실행 근거: 사용자의 기존 크리링 수집 확대 요청과 후속 “이어서 진행하라”. 아래는 그 범위의 구현 선택이며, 수집 확대가 외부 광고 전송·조회 권한 변경의 승인이라는 뜻은 아니다.
- 요구: [PRD](../product/crelink.md) R2·R7·R9·R10·R11·R27.

## 목적과 범위

현재 단축 주소 요청·일반 링크·크리에이터 배너 클릭 기록을 유지하면서 실제 공개 페이지 열람, 누락된 SNS·포트폴리오 클릭, 블록 노출, 활성 체류·스크롤, 캠페인과 브라우저 표시 환경을 더한다. 기존 NestJS·PostgreSQL·Next.js에 구현하며 새 SDK·외부 분석 서비스·DB·로그인 방식·디자인을 도입하지 않는다.

수집 1차 당시에는 내부 운영 분석용(R10)으로 구현해 크리에이터 통계 화면을 제외했다. 이후 사용자 명시 요청에 따른 본인 지표·통계 제공은 [조회 설계](crelink-analytics.md)에서 이어진다. 연락처 폼, 결제·광고 플랫폼 연동, GPS·기기 지문은 수집 1차 범위에 포함하지 않았고, IP 원문 보관기간은 기존 365일을 유지했다(R11).

## 경쟁사 확인

2026-11-05 공식 원문 확인. 공급자의 기능 설명이며 가입 후 실제 수집 검증은 아니다.

| 서비스 | 설계에 참고한 기능 | 출처 |
| --- | --- | --- |
| Linktree | 총·순 방문/클릭, 클릭률, 유입·국가/도시·기기, 수익화 전환. 성별 등 연결 SNS 통계는 일반 방문과 구분 | [Insights](https://linktr.ee/help/articles/5434178-understanding-your-analytics), 2026-10-27 갱신 |
| Beacons | 방문·클릭·IN/OUT, 구독자가 제출한 연락처·구매 이력과 익명 통계 구분 | [Traffic](https://help.beacons.ai/en/articles/4698753), [Audience](https://help.beacons.ai/en/articles/4703809), 2025-02-24 갱신 |
| Taplink | 폼에 유입 UTM 연결, lead/payment 상태와 클릭 분석 분리 | [UTM](https://taplink.at/en/help/faq/common/common/402.html), [Forms](https://taplink.at/en/guide/payments-form.html), 갱신일 미상 |
| Later | unique pageviews·버튼/포스트/소셜 클릭·CTR, 목적지 GA와 UTM | [Analytics](https://help.later.com/hc/en-us/articles/360042743234-Link-in-Bio-Analytics), 2024-06-19 갱신 |
| Lnk.Bio | 클릭/조회/CTR·국가/언어/유입/기기·swipes/landings | [기능표](https://stats.lnk.bio/all-features?sc=en), 2026-05-05 표기 |
| 리틀리 | 방문·클릭률·유입 채널/국가, GA·Pixel·UTM | [분석](https://start.litt.ly/feature/analytics), 갱신일 미상 |
| 인포크 | 방문·클릭·소식받기 전환, 요일/시간대·유입·링크 순위 | [통계 가이드](https://blog.inpock.co.kr/guide-getting-started-statistics/), 2025-07-21 |

## 계약과 데이터

계약 원본은 `packages/shared/src/crelink.ts`(공개 응답·경로)와 `packages/shared/src/telemetry.ts`(이벤트·UTM·입력 제한), 데이터 구조 원본은 API migration이다. 기존 공개 응답에 선택적 `telemetryToken`·`telemetrySessionKey`, 식별 가능한 SNS·블록 ID를 추가해 기존 클라이언트/fixture 호환을 유지한다.

- `POST /api/landings/{publicId}/events`, 성공 204. BFF 공개 허용 경로도 같은 계약을 사용한다.
- 공통: 서명 token, UUID eventId·sessionId·pageViewId, type(`page_view/click/impression/engagement`).
- 대상: `targetKind`(block/link/social/portfolio/creator_banner/ad_banner), targetId. 서버가 페이지·공개 상태·실제 대상 소속을 확인한다.
- 누적 행동: 활성 체류 activeMs와 최대 scrollPercent. 재전송해도 합산하지 않고 최대값으로 갱신한다.
- 환경: language·timeZone, viewportWidth/Height·screenWidth/Height·pixelRatio. 종류·길이·수치 범위를 제한한다.
- 캠페인: source·medium·campaign·id·term·content 6개 UTM 값만 허용하고 각 길이를 제한한다. 외부 /p 진입→현재 단축 URL→/p 리디렉트에서 보존한다.
- 원본은 서버 기록 시각·페이지·익명 방문자·세션·페이지뷰·사건·검증된 대상·환경/캠페인을 보관한다. 필요한 IP/UA/지역은 기존 단축 주소 방문에서 확보된 값만 연결하며 BFF의 내부 IP를 방문자 IP로 대체하지 않는다.
- 별도 세션 테이블·수집 SDK를 미리 만들지 않는다. page_view/impression 중복, event ID 멱등과 대상 소유 경계를 DB·HTTP에서 검증한다.

## 신뢰 경계와 보존

short/web은 서로 다른 호스트여서 host-only 방문자 쿠키를 억지로 공유하지 않는다. 새 단축 주소 통과 값은 익명 방문자 ID를 서명에 바인딩하고, 구 통과 값도 기존 페이지 열기에 쓸 수 있게 한다. 유효한 새 값에서만 페이지·방문자에 바인딩된 별도 목적의 24시간 행동 token을 발급한다. 관리·내부 미리보기에는 행동 token을 발급하지 않는다. 기존 익명 방문자의 stable key를 별도 prop으로 주어 쿠키가 바뀐 방문을 이전 브라우저 세션에 섞지 않는다. 이 값은 사용자 로그인·권한 인증으로 쓸 수 없다.

BFF는 해당 경로의 JSON·작은 본문 한도·같은 출처를 확인해 Origin만 전달하고, API도 설정된 웹 Origin과 정확 비교한다. 서버는 미지정 필드·형식 오류·다른 페이지 token·다른 대상·중단 계정을 거부한다. 입력으로 방문자 IP·사용자 ID·임의 URL을 받아 저장하지 않는다. 크기를 제한하고 메모리 증가가 제한된 rate guard를 적용한다.

원본 365일 이후에는 기존 보존 트랜잭션에서 비식별 일별 합계로 옮겨 삭제한다. 새 합계에 IP·방문자/세션 UUID·UA 원문·자유 입력을 남기지 않는다. 기존 리디렉트 클릭과 새 브라우저 click을 하나의 클릭 수로 더하지 않는다.

## 웹 수명주기

공개 성공 route에만 화면을 그리지 않는 Client tracker를 붙인다. 기존 Landing은 Server Component를 유지하며 명시적 target kind/id 속성만 추가한다. token은 SSR props로 전달해 PassCleanup과의 경합을 피한다.

페이지별 세션은 30분 유휴를 기준으로 sessionStorage에서 이어가며 저장소 차단 시 메모리 안에서 동작한다. React StrictMode의 재실행과 BFCache 복귀를 구분한다. 활성 체류는 문서가 보이는 동안만 증가하며 숨김·종료 때 beacon/keepalive로 전송한다. 누적값과 고정 event ID로 중복을 막는다. 스크롤·IntersectionObserver는 실제 화면 기준으로 측정한다. URL·앵커 텍스트·폼 입력값을 훑어 수집하지 않는다. 수집 실패는 탐색을 막지 않는다.

## 화면 상태와 개인정보

수집 1차에는 새 설정·로딩 화면이 없었다. 데이터 수집 실패에도 페이지와 기존 링크 이동은 정상 동작한다. 개인정보 처리방침에 새 행동·환경·캠페인·세션 저장 및 보존을 반영했다. 당시 운영자 전용 R10은 후속 [조회 설계](crelink-analytics.md)에서 관리자 통합·크리에이터 본인 집계 조회로 변경됐다. 이 문서나 코드 검증을 법률 검토 완료로 표현하지 않는다.

## 검토와 검증 계획

- API 검토: 기존 pass와 구 클라이언트 호환, 실제 방문 연결·입력 크기·소유 검증·멱등·보존.
- 웹 검토: Server Component 경계·프리뷰 제외·PassCleanup·StrictMode·BFCache·storage 차단·BFF 출처 경계.
- 보안 검토: token 목적/기한/페이지, 다른 대상·suspended/hidden·과다 요청·원본/집계 경계. 검토 결과와 수정은 work item에 남긴다.
- API 통합: 격리된 PostgreSQL에서 성공/실패 HTTP와 실제 행 검증, 중복·누적·다른 페이지·타인 대상·삭제/보존 회귀.
- 웹: 의미 있는 순수 함수/node:test, 실제 API와 ego-lite에서 390/1280px 공개 방문·UTM·클릭·스크롤·노출·체류·내부 제외·콘솔/넘침 확인.
- 전체: `pnpm verify`, `pnpm work:scope 0181`. 네이티브 smoke가 별도 브라우저를 실행하면 ego-lite에서 같은 health/render/console/width 조건을 확인하고 차이를 기록한다.

## 구현 경계

0183은 공유 계약, 0184는 API·migration·보존, 0185는 웹 수집·BFF, 0181은 통합 검증·공통 문서이다. 0182는 사용자 관점의 전체 결과를 검증한다. 새 UI 디자인 산출물은 필요하지 않다.

## 알려진 한계

브라우저 차단·페이지 종료·네트워크 단절로 행동 전송이 유실될 수 있다. token은 프로세스별 키에 묶여 배포/재시작 시 무효가 될 수 있다. IP 위치·브라우저 기종은 추정이며 쿠키 ID는 실제 사람을 식별하지 않는다. 외부 사이트의 구매·팔로우 완료는 이 이벤트만으로 알 수 없다. 생산 트래픽과 실제 iPhone/인앱 브라우저는 별도 검증 대상이다.
