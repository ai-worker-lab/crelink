# 리스트 밀도 선택

- 상태: 승인
- 작성일: 2026-11-07
- 승인 근거: 사용자의8개·10개·12개 실제 설정·저장·표시 요청. 최신 실행 정책은 자율 구현·검증·commit/push·검토 가능한 PR/CI까지이며 merge는 사람이 확인한다. 두 옵션 요청과 이전 자동 merge/deploy 지시를 대체한다.
- 통합: [0201](../work/crelink-pm/0201-list-density.md)
- 기준: [기존 링크 표시 설계](link-grid-layout.md), [PRD R5](../product/crelink.md), [디자인 시스템](../../design/system/DESIGN.md).

## 요구 대응

| 요구 | 구현 경계 | 관찰 기준 |
| --- | --- | --- |
| D1 세 옵션·기본8 | 기존 링크 표시 설정에서 리스트 선택 시8개형·10개형·12개형 즉시 저장 | 기존 데이터8, 세 값 reload·재로그인·공개 방문 보존 |
| D2 서버 영속·권한 | PATCH /api/me/landing, landings.list_density, creator/public 응답 | 실제 PostgreSQL 값·인증401·타인 격리·잘못된 값400 |
| D3 리스트에만 적용 | linkLayout과 독립한 listDensity, 공유 Landing 렌더러 | list/grid 왕복·가져오기 후 값 보존,2열 카드와 전체열 배너 유지 |
| D4 가독성·사진 | 높이·여백·썸네일·간격만 조정 | 제목 글꼴 유지·contain·대체 아이콘·긴 제목/설명 줄바꿈·44px 터치 |
| D5 오류·경합 | 기존 ActionState와 공통 busy, 동기 중복 잠금 | 503·잘못된 응답·세션만료 시 해당 값만 이전 성공값 복구·오류·수동 재시도 |
| D6 실제 근거 | API/DB와 실제 브라우저3엔진 | 390px 폭·740px 목록 영역에서 동일 한줄 제목/이미지의 완전 노출8/10/12, 폭320/390/768/1280·200% 글자·배너 |

## 공유 계약과 데이터

API worker가 `packages/shared/src/crelink.ts`에 `export type ListDensity = 8 | 10 | 12`를 추가한다. `CreatorLandingState.landing.listDensity?`, `PublicLandingView.listDensity?`, `UpdateLandingRequest.listDensity?`의 타입은 ListDensity이다. 누락은8, 새 서버는 항상 숫자를 직렬화한다. PublicLandingResponse는 상속 계약을 따른다. 기존 linkLayout은 변경하지 않는다.

기존 PATCH /api/me/landing에 JSON 숫자 listDensity만 추가한다. 생략은 보존,8/10/12 이외의 null·문자열·불리언·배열·객체·다른 숫자는400 validation_failed이다. SessionGuard와 WHERE user_id를 유지하며 사용자 지정 userId/publicId로 타인을 바꾸지 않는다. 기존 프로필/링크/가져오기 업데이트는 이 컬럼을 건드리지 않는다.

추가형 migration0012에 landings.list_density smallint NOT NULL DEFAULT8 CHECK(list_density IN (8,10,12))를 둔다. 이전 서버 rollback 때도 컬럼/값을 남긴다. SQL row type·creator state SELECT/직렬화·공개 SELECT/직렬화에 연결한다. DB 타입·migration 번호는 실제 파일 중복 검사 후 확정한다. 새 endpoint·패키지·인프라는 없다.

## 화면 상태와 API 대응

LinkLayoutPicker의 같은 ActionState·busy를 재사용하며 밀도 라디오 그룹은 리스트 선택 시에만 표시한다. `8개형 (여유롭게)`·`10개형`·`12개형 (촘촘하게)` 같은 명확한 명칭을 사용한다. 화면 높이·글자 크기·제목 길이에 따라 보이는 개수는 달라진다는 짧은 안내를 둔다. 고정 개수 보증·제목 잘라내기는 하지 않는다.

요청 전 낙관적 해당 필드 변경, 동기 ref 잠금과 기존 pending으로 중복/경쟁 전환 방지, 서버 응답의 실제 숫자 일치 검사 후 성공 처리한다. 누락 응답은8 기본 표시와 별개로 저장 성공으로 인정하지 않는다. 실패는 선택 필드만 함수형 setState로 복구해 다른 프로필·링크·가져오기 상태를 덮어쓰지 않는다. 잘못된 응답·503·401은 기존 ActionState 오류 경로와 수동 재선택 재시도를 사용한다. 저장중 이탈·다른 편집 차단은 기존 공통 패턴을 보존한다.

Landing과 toLandingPreview에 동일 필드를 전달하고 list 전용 class/data 속성으로 CSS를 제한한다. grid는 기존 규칙 그대로 유지한다.8개형은 현재56px 썸네일+세로12px padding+border의82px 카드/12px 간격을 보존한다.10개형·12개형은 기존 space 토큰과 가변 콘텐츠 최소높이로 각각 약66px/54px 카드·간격8px을 출발점으로 삼고 브라우저 실측으로 확정한다(740px에서8/10/12 완전 노출). 고정 height·line-clamp·글꼴 축소는 금지한다. 긴 내용/200% 확대 시 높이는 자연스럽게 늘어난다. 사진 contain은 모든 리스트 밀도에서 적용한다.

## 시각 기준과 한계

settings-sync `research/crelink-ui-ux/2026-11-07/list-density/README.md`, `comparison.html`, list-8/10/12.png를 직접 검토했다.8은 사용자 원본이고10/12는 생성 시안이므로 CSS 실측·실행 증거가 아니며 제품 자산으로 복사하지 않는다. 흰 카드·굵은 동일 제목·썸네일 축소·세로 여백 감소라는 방향만 사용한다. 실제 iPhone13 Pro 실기는 별도 사용자 확인 없이는 미검증이다.

## 소유·티켓과 실행 순서

- [0202 API](../work/api/0202-list-density-api.md): apps/api/**와 packages/shared/**만 편집. 공유 계약을 먼저 반영하고 Web이 소비 가능하도록 알린 후 서버 구현·영역문서·테스트를 완료한다.
- [0203 Web](../work/web/0203-list-density-web.md): apps/web/**만 편집. 확정된 위 계약으로 독립 구현하되 API shared 파일을 수정하지 않는다. 영역문서·로그도 소유한다.
- [0204 QA](../work/crelink-qa/0204-list-density-qa.md): 구현 인수 후 tests/e2e/**·docs/reviews/**만 편집하며 런타임 단독 소유. 기존 link-layout3엔진 suite를 확장한다.
- PM0201: 루트 문서·설계·티켓·통합·commit/push/PR/CI와 사람 검토용 인계. 전문 worker commit/fanout 금지, 최대2명 동시. 부모가 provider omp/model openai-codex/gpt-6.1-sol을 명시하여 같은 checkout에 생성한다.

## 검증 계획

API는 실제 격리 PostgreSQL에서 기본값·세값 PATCH→DB→creator/public·invalid 입력·401·타인/관리자 권한·프로필/가져오기 보존을 검증한다. Web은 미수신 기본8·미리보기 전환·save 응답 검증과 field-only rollback을 증명한다. QA는 실제 API/DB 합성 계정으로 reload·재로그인·공개/미리보기 일치·list/grid 왕복·가져오기 보존·오류/복구·동기 중복을 검사한다. 일반 한줄·동일 사진12개 이상으로 목록 시작부터740px 영역의 완전 노출수를 실측하고8/10/12 캡처와 나란한 비교 자료를 남긴다. 긴 제목/설명·사진 없음·배너·200% 글자·가로넘침·44px을3엔진과 지정 폭에서 확인한다. 기존 Linux grid baseline·retry/skip/오류필터/허용치는 바꾸지 않는다.

PM은 pnpm verify·smoke·영향 E2E·docs/scope와 최종 main 대상 원격 SHA의 필수 CI success를 확인한다. 선행 PR148은2026-11-07 main에 squash 병합됐으며 기준은 b95142d532d6008c6c61b550cca63c238025d450이다. PR149는 기존 feature branch에 origin/main을 정상 merge해 밀도·0205 수정과 선행 회귀를 보존한 뒤 main 기준으로 검증한다. 목적이 끝난 stacked branch CI trigger는 제거하고 기존 main 대상 CI·job·권한·보호규칙을 유지한다. 자동 PR merge/deploy·운영 credential/precheck/start/guard·운영 데이터 쓰기·별도 운영 방문 시험·자동화 설정 변경은 이번 범위가 아니다.

## 위험·복구

추가형 컬럼은 구 서버에서 무시되며 rollback 시 보존된다. 이전 API의 무시한200 응답을 성공으로 오인하는 위험은 응답 값 일치 검사로 막는다. 글자가 긴 실제 콘텐츠에서는 숫자만큼 안 보일 수 있으며 안내와 가변 높이로 가독성을 우선한다. 배포는 사람의 merge 검토 이후 기존 CD가 담당하며 이번 작업에서 자동 실행하지 않는다.

## 검토 기록

- 2026-11-07 PM: 기존 PATCH partial update·user_id 조건·공개/미리보기 공통 Landing·ActionState 패턴 확인. API/Web 전문 worker는 착수 시 이 계약을 검토하고 충돌만 부모에게 보고한다.
- 2026-11-07 API/Web 구현 인수: 공유 계약·migration0012와 기존 PATCH/공개/creator 직렬화를 연결했고 필드만 갱신/복구·동기 ref 잠금·list 전용 CSS를 적용했다. 실제 구현 원본은 packages/shared/src/crelink.ts, apps/api/migrations/0012_list_density.sql, apps/web/src/components/manage/LinkLayoutPicker.tsx·Landing.tsx·styles.css이다.
- 2026-11-07 QA 인수: [실제3엔진 측정/캡처](../reviews/0204-list-density-qa.md)에서82/66/54px 카드·12/8/8px 간격·16px 제목 유지·contain·목록740px의8/10/12 완전행과 공개/미리보기 일치를 확인했다.34개 고유 통합시나리오와 보강 후 동일 layout9개 재실행이 통과했으며 실물/OAuth/live외부와 Linux baseline의 검증 한계를 분리했다.

## 최종 CI에서 발견한 기존 클릭 회귀

PR149 초회 실제 CI42347875468에서 persona SIM-01의 legacy link_clicks1과 analytics pageViews1/clicks0을 관찰했다. trace는 pageview POST 뒤 응답 전 클릭·외부 이동, click POST 부재를 보였다. 기존 클라이언트는 등록204 전 이벤트를 메모리 pending에 두고 응답 후 drain하지만 문서 종료 때 drain이 사라질 수 있다. API는 anchor 없는 비pageview를 거부하므로 두 beacon 병렬 전송만으로는 해결하지 않는다.

[0205](../work/web/0205-pending-click-delivery.md)에서 기존 API 계약을 유지한 최소 Web/BFF 순차 전달을 검토한다. 사용자 이동지연·테스트 대기/재시도/필터·통계 대체·API/shared/DB 변경은 금지하며, 수정 전/후 지연등록+즉시 이동을 실제DB·3엔진에서 증명한다. 이 결함은 밀도 기능 확대가 아니라 기존 수용 회귀 통과의 선행이다. Web은 제품/E2E 단일 편집자와 슬롯2 runtime을 소유하고 API 검토는 읽기 전용이다.

실제 수정은 기존 BFF의 `{pageView,event}` 좁은 묶음을 pageview204 뒤 click/engagement 순서로 중계한다. 개별 이벤트의 API 검증·rate·멱등은 그대로이며 묶음 전체16KiB·Origin·쿠키 미전달과 첫 실패 원오류 반환을 유지한다. 링크 이동은 취소/지연하지 않는다. 수정전 DB1/0, 수정후1/1·지연 upstream3엔진·중복/거절 검증은 [Web 근거](../../apps/web/docs/visitor-telemetry.md)에 연결한다. BFF 수신 후 요청 안의 순서 보장이지 오프라인·프로세스 강제종료·원자적 영속 전달 보장은 아니다.
