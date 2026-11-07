# 0203 리스트 밀도 설정·미리보기·공개 표시

- 단계: 티켓
- 역할: web
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-07

## 목적

기존 링크 표시 설정에8개형·10개형·12개형을 제공하고 저장·공개·미리보기를 같은 스타일로 표시한다.

## 수용 기준

- [x] 리스트 선택 시 세 밀도를 노출하고 즉시 PATCH 저장하며 누락 기본8·화면 조건 안내를 제공한다.
- [x] ActionState·busy·동기 중복 잠금·응답 일치 검증과 field-only 실패 복구·오류·수동 재시도를 구현한다.
- [x] 공유 Landing과 toLandingPreview에 listDensity를 연결하고 grid2열/배너/다른 상태를 보존한다.
- [x] 제목 크기·가독성·줄바꿈·사진 contain·대체아이콘·44px 조작을 유지하고740px 목록에서8/10/12 차이를 실측한다.
- [x] 영역문서/로그·미리보기 회귀·실행 근거와 미검증을 보고한다.

## 범위

- 포함: apps/web/**만 편집. 확정 계약 ListDensity=8|10|12, creator/public/PATCH listDensity 선택 필드·누락8을 소비한다.
- 제외: shared/API/E2E/루트문서 편집, commit/push, fanout, 운영/다른 checkout.

## 위험·복구

밀도 CSS를 list에만 제한한다. 고정height/line-clamp/제목축소 금지. save 응답 전체를 덮어쓰지 않는다. 공유 계약은 API worker가 먼저 반영하며 Web은 수정하지 않는다.

## 연결

- [설계 화면 상태·D1/D3~D6](../../specs/list-density.md#화면-상태와-api-대응)

## 진행 기록

- 2026-11-07: 시안8/10/12는 이미지 방향 기준이며 실제 CSS 실측이 아니다. 구현 인수 후 QA가 전용 런타임을 단독 소유한다.
- 2026-11-07: 부모가 Web Task task_ef85424a4dae / Dispatch ctx_859916a6bec6를 provider omp/model openai-codex/gpt-6.1-sol로 시작했다. API의 shared 계약 반영을 기다려 소비하고 정적 구현/검사만 수행한다. 실제 브라우저/전체 verify는 인수 후 QA 전용 런타임에서 실행한다. 티켓과 루트 로그는 PM이 편집한다.
- 2026-11-07: 부모가 worker_done msg_8547f1176758 succeeded/settled를 인수했다. 변경6파일은 LinkLayoutPicker·Landing·landing-preview·styles.css·Web README/CHANGELOGS이다. PM은 실제 field-only 함수형 갱신·동기 ref 잠금·응답 숫자 일치 검사·리스트 조건 노출·공개/미리보기 전달·list 전용 CSS를 읽어 확인했다.
- 2026-11-07: Web worker 보고: typecheck·변경TS3파일 ESLint·최종 소스4파일 Prettier exit0, 기존 Web test96/96. 일회성 transpileModule/vm 핸들러 smoke로 누락 기본8·세숫자·동기중복/교차잠금·10 list/grid 왕복·응답누락/문자열/다른숫자/null·503/401 rollback·다른초안 보존·수동재시도·busy를 확인했다. 최초 format 실패는 수정 후 통과했다. 실제 브라우저/DB저장/401 redirect·740px 행수·200%는 미검증으로 QA0204에 넘겼으며 Web은 런타임을 조작하지 않았다.
- 2026-11-07: QA0204 actual API/DB·3엔진·실제401·740px 실측·지정폭/200% 검증을 [보고서](../../reviews/0204-list-density-qa.md)와 JSON에서 인수했다. PM이3엔진 비교PNG와 WebKit8/12 원본을 직접 열어 가독성·차이를 검토했다. 실물/iPhone·OS확대는 미검증으로 보존한다.
