# 0201 리스트 밀도 통합·검토 PR

- 단계: 티켓
- 역할: crelink-pm
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-07

## 목적

사용자 승인8개·10개·12개 리스트 밀도를 실제 저장·공개 표시하고 검증·PR·최종 CI와 사람 검토용 인계까지 통합한다.

## 수용 기준

- [x] 기본8·세 옵션 API/DB 영속·편집 reload/새 세션/공개·권한 격리·invalid 거부 근거가 있다. live OAuth 자체는 미검증이다.
- [x] 리스트만 변경하며 list/grid 왕복·가져오기·다른 콘텐츠·배너와2열 카드를 보존한다.
- [x] 실패 복구/재시도·중복 방지·긴 글자·200%·폭320/390/768/1280·3엔진 검증과 실제8/10/12 캡처·비교 근거를 남긴다.
- [ ] pnpm verify·smoke·통합 E2E·scope·문서와 최종 원격 SHA의 동일 `CI 통과` job이 통과한다. stacked branch에 main ruleset 보호가 설정됐다는 뜻은 아니다.
- [ ] PR148 의존성을 명시한 후속 PR과 최종 SHA/CI를 전달하고 사람의 merge 검토에 인계한다.

## 범위

- 포함: [설계](../../specs/list-density.md)의 D1~D6·전문 worker 인수·루트 문서·단일 commit/push/PR·최종 CI.
- 제외: 자동 merge/deploy, 운영 credential/precheck/start/guard, PR148 수정/병합, 다른 checkout/런타임, 다른 PR, 자동화 설정, 운영 데이터 쓰기.

## 위험·복구

추가형 migration을 보존하며 구 서버로 rollback 가능하다. 밀도 수치는 고정 노출 보장이 아니며 실물 iPhone은 별도 검증 없이 미검증이다. merge는 사람 검토 대상으로 남긴다.

## 연결

- [리스트 밀도 설계 D1~D6](../../specs/list-density.md)
- [PRD R5](../../product/crelink.md)

## 진행 기록

- 2026-11-07: 기존 checkout21622f5에서 PR148 최종22cffa10bd4d59d21b4bb0f127ffaefa2c0375a4를 ff-only 반영하고 work/0201-list-density를 생성했다. 기존 QA checkout/런타임은 건드리지 않았다. 사용자 최신 지시로 완료 범위를 commit·merge·Actions 배포까지 확장했다.
- 2026-11-07: 부모가 정상 운영 자격정보 부재를 확인하여 PR148 merge와 이번 merge/deploy는 guard 선행 대기다. 자격정보를 읽거나 발급·설정변경하지 않고 로컬 구현/QA와 PR CI를 진행한다.
- 2026-11-07: 최신 사용자 정책으로 이전 자동 merge/deploy 요구를 대체했다. 운영 자격정보는 PR 작성의 선행 조건이 아니며 문의·조회·발급하지 않는다. PR148 미병합 동안 후속 base는 work/0200-release-qa이다.
- 2026-11-07: pnpm verify --docs 통과(work174개·Markdown302개·design 통과, 기존 P2 anchor 경고). 최초 scope는 node_modules 부재로 yaml 해석 실패했고 pnpm install --frozen-lockfile 후 scope0201이8개 변경 모두 소유 경로로 통과했다.
- 2026-11-07: 부모가 API0202(ctx_000246a9ab0c)·Web0203(ctx_859916a6bec6)를 같은 Run/checkout에 ready로 생성했고 provider omp/model openai-codex/gpt-6.1-sol을 확인했다. 초기 런타임은 API 단독 소유, Web 정적 구현 후 QA가 인수한다. PR148은22cffa1/필수 CI 성공으로 사람 검토 인계되었고 자동 병합하지 않는다.
- 2026-11-07: 기존 CI가 main 대상 PR만 받아 stacked base에서는 실행되지 않는 것을 확인했다. 부모 결정 msg_26f6d93c0ece에 따라 trigger를 main/work/0200-release-qa로 한정 확장하고 다른 job/권한/보호설정은 유지한다. 실제 stacked base의 최종 HEAD/CI head/base/merge SHA와 artifact를 기록하고, 선행 PR148을 사람이 병합해 main으로 조정하면 다시 CI를 확인한다. 임시 main retarget 방식은 채택하지 않는다.
- 2026-11-07: actionlint가 설치되어 있지 않아 최초 실행127 뒤 brew install actionlint로1.7.12를 설치했다. actionlint .github/workflows/ci.yml 종료0과 pnpm verify --docs 3단계 통과를 확인했다. 전체 verify/실제 browser는 구현 인수 후 전용 QA 런타임에서 실행한다.
- 2026-11-07: API/Web/QA 모두 succeeded/settled 인수 완료. [QA 보고서](../../reviews/0204-list-density-qa.md)의 core9/personas4/analytics12/layout9·layout-final9 JSON을 직접 대조했고 각 expected 일치·unexpected/flaky/skipped0이었다.34개 고유검사이며 반복 layout9를 고유검사로 합산하지 않는다.3엔진 비교PNG와 WebKit 원본8/12·measurements.json을 직접 검토해 제목16px/contain·82/66/54px·8/10/12 완전행을 확인했다.
- 2026-11-07: QA가 슬롯2 runtime을 명시 반환했다. PM은 인계된 Web PID18495를 종료하고 최종 build를 시작했으며 이후 QA의 SIGTERM143 통지와 일치한다. API3220/DB5652는 보존하고 Web은 최종 빌드 뒤 이 checkout의 make web-up으로 재시작한다. QA의 고아보고서는 docs/README.md에 연결했다.
- 2026-11-07: 최초 전체 pnpm verify는 measurements.json Prettier만 실패(나머지 typecheck/build/test 미실행)했다. JSON 포맷 수정 후 재실행은8단계 모두 통과, API32 suites263 tests·Web96 tests·loopback 안전검사18 tests가 통과했다. 기존 design P2 section-anchor 경고는 실패가 아니며 변경하지 않았다. 실제회귀·원본캡처와 실물/OS확대/liveOAuth·외부Instabio·Linux시각baseline not-run을 구분한다.
- 2026-11-07: make web-up 직후 첫 smoke는 ready 이전 ECONNREFUSED로 종료1이었다. pnpm logs web에서 Next Ready312ms·오류로그 비어있음을 확인한 후 pnpm smoke5/5 통과했다. scope0201은50개 파일 모두 소유 범위, actionlint 종료0·docs303개·work174개 검사 통과. PR148은 원격 조회에서 OPEN/isDraft=false/mergedAt=null·HEAD22cffa1로 확인해 stacked base를 유지한다.
