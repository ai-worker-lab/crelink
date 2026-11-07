# 0201 리스트 밀도 통합·검토 PR

- 단계: 티켓
- 역할: crelink-pm
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-07

## 목적

사용자 승인8개·10개·12개 리스트 밀도를 실제 저장·공개 표시하고 검증·PR·최종 CI와 사람 검토용 인계까지 통합한다.

## 수용 기준

- [x] 기본8·세 옵션 API/DB 영속·편집 reload/새 세션/공개·권한 격리·invalid 거부 근거가 있다. live OAuth 자체는 미검증이다.
- [x] 리스트만 변경하며 list/grid 왕복·가져오기·다른 콘텐츠·배너와2열 카드를 보존한다.
- [x] 실패 복구/재시도·중복 방지·긴 글자·200%·폭320/390/768/1280·3엔진 검증과 실제8/10/12 캡처·비교 근거를 남긴다.
- [x] pnpm verify·smoke·통합 E2E·scope·문서와 원격 SHA의 동일 `CI 통과` job이 통과한다. stacked branch에 main ruleset 보호가 설정됐다는 뜻은 아니다.
- [x] PR148 의존성을 명시한 후속 PR과 SHA/CI를 전달하고 사람의 merge 검토에 인계한다. 마지막 근거 기록 commit도 push 뒤 CI를 확인한다.

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
- 2026-11-07: 기능 commit a71b5024ea647b34b065b6830fac1d5a621a4e49(50파일)을 push하고 [후속 draft PR149](https://github.com/ai-worker-lab/crelink/pull/149)를 work/0200-release-qa 대상으로 생성했다. 실제 PR/CI head는a71b5024ea647b34b065b6830fac1d5a621a4e49, base는22cffa10bd4d59d21b4bb0f127ffaefa2c0375a4, refs/pull/149/merge는4bd297e3e25be13c33dab8fc25d5a02db5060163이다. [CI42347875468](https://github.com/ai-worker-lab/crelink/actions/runs/42347875468)을 gh run watch --exit-status로 관찰 중이며 완료 전 성공으로 쓰지 않는다.
- 2026-11-07: 초회 CI42347875468은 실패했다. Node24/26·이미지API/Web·scope 성공, core9통과 뒤 personas3통과/1실패·flaky/skipped0, analytics/layout 미실행이다. 실패artifact를 .local/ci149-first에 다운로드했고 SIM-01의 실제302/legacy click은 있으나 analytics pageViews1/clicks0을 trace와 JSON에서 확인했다.
- 2026-11-07: ready 전 pending click을 pageview 응답 뒤에만 보내는 VisitorTracker와 즉시 외부 이동 사이의 유실 가능성을 확인했다. [0205 Web 결함](../web/0205-pending-click-delivery.md)으로 추적하며 부모가 Web ctx_467cdd117834 단일 편집자·슬롯2 runtime 단독소유와 API ctx_43d1828b352b 읽기전용 교차검토를 시작했다. 사용자 이동지연·테스트wait/retry/filter/skip·두beacon병렬·Nest/shared/DB변경은 하지 않는다. PM은 두 결과/런타임 반환까지 빌드·서버·브라우저·DB를 중복 조작하지 않는다.
- 2026-11-07: 0205 Web과 API 최종 읽기대조 모두 succeeded/settled 인수 완료, blocker0. PM이 원본 등록 payload·BFF204후 순차중계·실패/바인딩/보안/16KiB/rate 경계와 기존SIM01불변을 읽고, 실제 수정후 personas5 및 SIM05/지연upstream 각3엔진 JSON expected5/3/3·unexpected/flaky/skipped0을 대조했다. 정확한 경로·수정전 실패·영속전달/오프라인 한계는 [영역 근거](../../../apps/web/docs/visitor-telemetry.md)에 있다.
- 2026-11-07: runtime 반환 뒤 PID67490 next-server를 확인·종료하고 최종 pnpm verify8단계(API32 suites263/Web99/guard18)와 production Web density-final-web5393 재기동 뒤 smoke5/5·scope57파일·actionlint를 통과했다. 임시proxy3221·계측파일5개·수동계정·Ego 정리를 인수했고 API3220/DB5652를 유지했다. 기존 QA34개와 SIM05 추가 후 현재 예상35개를 문서에서 구분했다. 최종 CI는 동일PR149·선행base에서 실제 실행/JSON으로 확인한다.
- 2026-11-07: 수정 commit4a27c9b424c6caaba5cbeea5dcd8666ad1e4fcca를 push한 [CI42356688161](https://github.com/ai-worker-lab/crelink/actions/runs/42356688161)이 전체 success였다. PR/실행 head는4a27c9b424c6caaba5cbeea5dcd8666ad1e4fcca, 실제base는22cffa10bd4d59d21b4bb0f127ffaefa2c0375a4, smoke checkout log가 확인한 refs/pull/149/merge는446c14124bcb3525ed3feb7980ec9081e5e559bf이다. Node24/26·이미지API/Web·scope·smoke·CI 통과 job 성공, docs job만 코드변경 조건으로 정상 skip이었다.
- 2026-11-07: [성공 artifact13567782306](https://github.com/ai-worker-lab/crelink/actions/runs/42356688161/artifacts/13567782306)을 .local/ci149-success에 내려받아 core9/personas5/analytics12/layout9의 실제 JSON을 직접 대조했다. 고유35개 전부expected/pass·unexpected/flaky/skipped/errors0이었다. Ubuntu24.04 Linux Chromium의 기존 maxDiffPixels0 grid baseline·axe와3엔진 밀도 검사가 통과했고 Linux12 원본PNG도 직접 검토했다. 기존 baseline/조건/허용치를 변경하지 않았다.
- 2026-11-07: 기능 구현·로컬/실제CI 검증·사람 검토용 draft PR149까지 완료했다. 이 근거/상태만 기록하는 마지막 문서 commit의 최종 head/base/merge SHA와 CI는 PR149 최신 체크/본문에 이어 기록하고 확인한다. 선행PR148은 미병합이며 사람이 병합하면 밀도변경을 보존해 main 기준으로 정합화하고 CI를 다시 확인해야 한다. 자동merge/deploy·운영credential/guard·운영데이터쓰기는 하지 않았다. 실물iPhone/인앱/OS확대/liveOAuth·외부Instabio/CDN·강제종료/오프라인영속전달은 미검증이다.

## PR149 main 기준 병합 준비 재검토

- 2026-11-07 사용자 후속 요청: PR149를 다시 확인하고 병합 준비한다. 새 Task task_a1612baa619d / Dispatch ctx_6283acd6d955, 같은 Run/checkout·crelink-pm/provider omp/model openai-codex/gpt-6.1-sol을 유지한다. Orca worktree agentType=omp·동일 session을 확인했고 역할 YAML과 현재 시스템 모델은6.1-sol이다. reused Dispatch의 launch 모델/provider 필드는 null이므로 그 필드를 독립 실행설정 증거로 오인하지 않는다.
- 원격 사실: PR148은2026-11-07T09:10:22Z main에 squash 병합됐고 최신 기준은b95142d532d6008c6c61b550cca63c238025d450이다. PR149는main 대상으로 OPEN/isDraft=false/autoMerge=null·초기 head1bd207f262cb022a7b92c2da4a3818ec1b4a9622에서 CONFLICTING/DIRTY였다. 기존 stacked CI42357226846 success는 과거 근거이며 이번 main 검증으로 대신하지 않는다.
- 원인·해결: 최신main과 기존선행22cffa1의 tree가 모두5f58003692ed9285279e979cd2880070d37219be로 정확히 같았다. 정상 git merge --no-commit --no-ff origin/main에서 squash ancestry로8파일10블록 충돌이 났고 각 블록을 읽어 feature 요구를 보존했다. 충돌파일은 apps/web/README.md, docs/README.md, docs/product/crelink.md, docs/specs/README.md, docs/specs/link-grid-layout.md, tests/e2e/README.md, tests/e2e/instabio-import.spec.ts, tests/e2e/link-layout.spec.ts이다.
- 보존 판단: 밀도 설명/PRD·가져오기12 보존·SIM05·레이아웃 실패의 행동 assertion을 유지하고 기존 문구고정 검사로 되돌리지 않았다. 충돌해결 후 기존HEAD 대비 제품/테스트 코드 delta는0이다. 목적이 끝난 work/0200-release-qa CI branch filter와 검증 정책만 원래main 계약으로 복원하고 설계를 최신main 기준으로 갱신했다. job/권한/보호규칙·baseline/maxDiffPixels0·retry/skip/filter·마이그레이션은 바꾸지 않는다.
- 독립 검토: 부모가 시작한 QA Task task_599d156d1866 / Dispatch ctx_e76673984021에 고정tree03d8b82f2d110d9e9db4a50d4cc4bb7089aa35f6와 main 기준 delta·8충돌파일·해결근거를 전달했다. QA는 읽기 전용이며 PM이 Git/파일/슬롯2 runtime을 단독 소유한다. 본 기록 이후 최종 commit·main 대상 실제CI·artifact/보호조건 결과는 PR149 본문에 이어 기록해 문서commit/CI 반복을 만들지 않는다.
- 실행 경계: runtime5393의PID23247이 이 checkout 소유임을 Orca ports로 확인한 뒤 build 전에 종료했다. API3220/DB5652와 다른 checkout은 보존한다. 운영 credential/precheck/start/guard·운영 데이터·autoMerge·실제 PR 병합/배포는 실행하지 않는다. 실물폰/인앱/liveOAuth·외부Instabio/CDN·BFF 오프라인/프로세스 강제종료 영속전달 한계는 이전과 같다.
- 현재 통합 tree의 로컬 pnpm verify는8단계 모두 통과했다(API32 suites263 tests·Web99·shared59·loopback guard18). 기존 design P2 section-anchor 경고는 원래대로 유지했고 실패를 숨기지 않았다. production Web은 build 뒤 density-main-review-web5393으로 복구했다. main 기준 scope·문서·smoke와 독립 검토 결과를 인수한 뒤 한 번의 통합 merge commit으로 push하며 마지막 원격 CI/mergeability는 PR149 본문에서 확정한다.
- production smoke5/5·문서304개·actionlint가 통과했다. merge commit 전 scope는 origin/main...HEAD의 옛 공통조상 때문에74개를 세었고 모두PM owns 안이었다. merge commit 후 실제 최신 main 기준 scope를 다시 확인해 불필요한 선행 diff가 없는지 구분한다. 기존35개E2E는 제품/테스트delta0이므로 로컬에서 무작정 중복하지 않고 최종 main 대상 CI와 다운로드JSON으로 실행/수량·Linux baseline/axe/3엔진을 다시 확인한다.
