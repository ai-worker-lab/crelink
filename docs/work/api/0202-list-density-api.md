# 0202 리스트 밀도 API·공유 계약

- 단계: 티켓
- 역할: api
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-07

## 목적

리스트 밀도를 페이지별 실제 DB에 저장하고 기존 사용자/권한/부분수정 계약을 보존한다.

## 수용 기준

- [x] ListDensity=8|10|12와 선택 listDensity 필드를 creator/public/PATCH 계약에 추가하고 미수신8 호환을 명시한다.
- [x] 추가형 migration과 DB check/default8, SQL/직렬화 및 PATCH 엄격 숫자 검증을 구현한다.
- [x] 실제 PostgreSQL HTTP 시험에서 기본8·세값 PATCH/DB/creator/public·잘못된 값400·401·타인 격리·관리자 경계·프로필/가져오기 보존을 확인한다.
- [x] 영역문서/로그와 실행 명령·결과·미검증을 기록한다.

## 범위

- 포함: apps/api/**, packages/shared/**. 공유 계약을 먼저 반영하고 Web에 소비 가능 상태를 부모 통해 알린다.
- 제외: Web/E2E/루트문서 수정, commit/push, worker/fanout, 운영 credential/guard/배포, 다른 checkout.

## 위험·복구

추가 컬럼은 구 서버 rollback 때도 남긴다. 기존 updateLanding의 부분수정·user_id 소유 조건을 유지한다.

## 연결

- [설계 공유 계약과 데이터·D1~D3/D5](../../specs/list-density.md#공유-계약과-데이터)

## 진행 기록

- 2026-11-07: 계약/파일 소유 확정. API/Web 같은 checkout의 파일별 단일 편집, 전체 통합 검증은 PM과 후속 QA가 수행한다.
- 2026-11-07: 부모가 API Task task_8fbbf034e67d / Dispatch ctx_000246a9ab0c를 provider omp/model openai-codex/gpt-6.1-sol로 시작했다. 초기 인프라/API 검증 런타임은 API 단독 소유이며 Web은 정적 구현만 한다. 티켓과 루트 로그는 PM이 편집한다.
- 2026-11-07: API 인수 메시지 msg_a50cface3df7를 받았다. 변경12파일은 shared 계약, migration0012, creator/profile/public handler, creator/instabio-import/migrations/health/short-link API 테스트, API 문서/로그이다. PM은 계약8/10/12·optional 필드, migration smallint/default8/check, strict validation과 기존 user_id 부분수정 조건, 실제 DB·공개/권한/invalid 검증 코드의 보존을 읽어 확인했다.
- 2026-11-07: API worker 보고: shared build/API typecheck/build·소유 TS eslint/prettier exit0, API 전체32 suites263 tests passed 및 최종 영향5 suites64 tests passed. 슬롯2 PostgreSQL5652/API3220에서 실제 PATCH8/10/12→DB→creator/public, invalid12종400·익명401·타인 격리·creator admin403·operator 본인 수정·생략/프로필/grid/list 보존을 관찰했다. Instabio 후12 보존은 실제 PostgreSQL+HTTP 통합검사 통과이며 외부 Instabio/CDN·OAuth는 fixture 한계가 있다.
- 2026-11-07: API worker는 기준22cffa1의 이전 handler 임시서버3221에서 구 API 프로필 PATCH와 밀도 무시 뒤 새 DB/API12 보존을 확인하고 임시서버/복사빌드·합성계정4개를 정리했다고 보고했다. migration 테스트에서 기존행8·CHECK/NOT NULL·구서버 SQL쓰기 보존 통과. 합성계정0·API3220 ready200, 인프라/API 켜짐·Web 미기동·3221 정지 상태로 인수한다. 전체 verify/smoke/브라우저는 not-run이며 QA로 넘긴다. 최종 통합 판단은 PM/QA 근거와 연결한다.
- 2026-11-07: QA0204의 실제 저장/공개·새 세션·가져오기·실제401/권한 회귀를 [보고서](../../reviews/0204-list-density-qa.md)와 최종 JSON에서 인수하고 완료로 판정했다. OAuth 자체는 미검증이며 새 세션 보존과 구분한다.
