# 0204 리스트 밀도 실제 API·DB·3엔진 QA

- 단계: 티켓
- 역할: crelink-qa
- 선행: 0202, 0203
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-07

## 목적

저장·공개·오류 복구와8/10/12 실제 밀도를 합성 데이터로 증명한다.

## 수용 기준

- [x] 실제 localhost API/PostgreSQL의 기본8·세값 DB/creator/public·reload/재로그인·권한·invalid·가져오기 보존을 확인한다.
- [x] 503/잘못된 응답/세션만료·동기 중복·재시도·list/grid 왕복·다른 콘텐츠 보존을3엔진 suite로 검증한다.
- [x] 390px·740px 목록의 동일 한줄/사진 조건에서8/10/12 실측과 실제 캡처3종·나란한 검토자료를 남긴다.
- [x] 폭320/390/768/1280·긴 제목/설명·기본아이콘·사진·배너·200%글자에서 잘림/넘침/44px을 확인한다.
- [x] 실제 suite 테스트수·pass/fail/flaky/not-run·원본 PNG/trace/report·실물 미검증을 기록한다.

## 범위

- 포함: tests/e2e/**·docs/reviews/**. 인수 후 이 checkout의 전용 런타임 단독 소유.
- 제외: production 코드·shared·CI·Linux grid baseline 임의변경·skip/retry/오류필터/허용치 완화·운영/다른 checkout·commit/fanout.

## 위험·복구

합성 사용자는 지표 제외, 소유 데이터만 정리한다. 결함은 재현·기대/실제·수정 소유자를 PM에 전달한다. iPhone 실기는 별도 검증 없이 미검증이다.

## 연결

- [설계 검증 계획·D1~D6](../../specs/list-density.md#검증-계획)

## 진행 기록

- 2026-11-07: 구현 인수 뒤 착수. 브라우저/E2E 런타임은 QA 외 작업자가 동시에 재시작하지 않는다.
- 2026-11-07: 부모가 API/Web succeeded/settled 후 QA Task task_8e81637eb6bc / Dispatch ctx_bbb0521a5634를 같은 Run/checkout·provider omp/model openai-codex/gpt-6.1-sol로 시작했다. QA가 슬롯2 런타임을 단독 소유하고 PM은 전체verify/smoke/DB/browser를 동시에 조작하지 않는다. PM은 msg_40432a4f3aef로 수용 근거·report/캡처·결함 인계·preload/임시자원 정리·명시 런타임 반환 조건을 전달했다.
- 2026-11-07: worker_done msg_775005b1d5b5 succeeded/settled와 명시 런타임 반환을 부모가 확인했다. [QA 보고서](../../reviews/0204-list-density-qa.md)에34개 고유 통합시나리오(core9/personas4/analytics12/layout9)와 보강 후 동일 layout9 재실행 통과, failed/flaky/skipped0을 기록했다. PM은 네 suite와 layout-final JSON 및3엔진 비교PNG·측정 원문을 직접 대조했다.
- 2026-11-07: 새 세션 보존을 재로그인 상태 검증으로 확인했으며 live Google OAuth 자체는 미검증이다. 실물·OS확대·외부liveInstabio/CDN·Linux baseline은 미검증으로 구분했다. 기존 baseline/skip/retry/filter/tolerance는 바꾸지 않았다.
- 2026-11-07: QA 인계 후 PM이 명시된 Web PID18495를 종료하고 최종 build를 시작했다. QA의 이후 SIGTERM143 통지는 이 종료와 일치하며 보고서의 Web 실행유지는 인계 당시 관찰이다. API3220/DB5652는 보존한다. 최초 전체verify는 measurements.json Prettier만 실패했고 해당 JSON 포맷을 수정한 뒤 전체 검증을 다시 실행했다.
