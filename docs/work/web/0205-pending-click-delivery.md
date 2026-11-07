# 0205 등록 대기 중 외부 이동의 클릭 행동 유실 복구

- 단계: 티켓
- 역할: web
- 상태: 완료
- 종류: 결함
- 우선순위: P1
- 작성일: 2026-11-07

## 목적

0201 후속 PR149 실제 CI에서 발견한 pageview 등록 응답 전 외부 이동의 pending click 유실을 제품 경로에서 고친다. 밀도 기능과 별개인 기존 회귀를 test wait/retry/filter로 숨기지 않는다.

## 수용 기준

- [x] 지연된 pageview 등록 응답과 즉시 실제 외부 이동에서 수정 전 행동 click0·수정 후 정상 click1을 실제 localhost API/DB·3엔진으로 증명한다.
- [x] 사용자의 이동을 지연하지 않고 기존 pageview anchor204 뒤 event 순서·인증/쿠키/권한·중복 방지·실패 경계를 유지한다.
- [x] 기존 SIM-01의 pageViews1/clicks1·실제302/목적지·legacy link_clicks·성장지표 제외 assertion을 유지하고 wait/retry/filter/skip·허용치·통계 대체를 추가하지 않는다.
- [x] 독립 beacon 두 개 병렬 발사·API/shared/DB 계약 변경 없이 최소 Web/BFF 구현을 선택하고 근거·영역문서·영향 검증·runtime 반환을 보고한다.

## 범위

- 포함: VisitorTracker/visitor-telemetry와 필요한 최소 Web BFF route/helper·Web unit tests·웹 영역문서, 필요한 personas E2E만. 파일별 단일 편집자 Web ctx_467cdd117834.
- 제외: Nest API/shared/migration·다른 E2E·루트 CI/문서/티켓·commit/push·fanout·운영/다른 checkout. API ctx_43d1828b352b는 읽기 전용 교차 검토만 한다.

## 위험·복구

API는 pageview anchor가 없는 비pageview를 거부한다. 클라이언트 문서 종료 뒤 메모리 promise에 의존하면 queued click이 유실된다. 두 beacon 병렬 전송은 순서 보장을 못 하므로 금지하며 필요 시 기존 API를 순차 중계하는 최소 BFF를 검토한다. 사용자 navigation 지연이나 권한 완화로 고치지 않는다. 추가 DB/외부 서비스는 없다.

## 연결

- [0201 통합 티켓](../crelink-pm/0201-list-density.md)
- [밀도 설계·후속 회귀](../../specs/list-density.md)
- [초회 CI42347875468](https://github.com/ai-worker-lab/crelink/actions/runs/42347875468)
- [PR149](https://github.com/ai-worker-lab/crelink/pull/149)

## 진행 기록

- 2026-11-07: 실제 CI의 core9 통과 뒤 persona3통과/1실패, analytics/layout 미실행. SIM-01에서 legacy visits/link_clicks는1이나 analytics pageViews1/clicks0이었다. 실패 trace/PNG/JSON/로그를 .local/ci149-first에 보존했다. Node24/26·이미지2종·scope는 통과했고 CI 통과 job은 실패했다.
- 2026-11-07: PM이 trace의 page_view POST2154.634ms·click2225.957ms·navigation2316.167ms와 click POST 부재를 확인했다. VisitorTracker의 ready 전 메모리 queue·응답 뒤 drain과 API anchor 요구를 확인하고 부모에게 원인 수정을 요청했다.
- 2026-11-07: 부모가 Web Task task_01d47d4b933d / Dispatch ctx_467cdd117834를 단일 편집자·슬롯2 runtime 단독 소유로 재개하고 API Task task_262f136557e8 / Dispatch ctx_43d1828b352b를 읽기 전용으로 시작했다. provider omp/model openai-codex/gpt-6.1-sol 유지. PM은 runtime/제품파일을 중복 조작하지 않는다. 역할이 다른0201의 schema상 하위티켓 대신 독립 Web 티켓을 연결해 추적한다.
- 2026-11-07: API 읽기 전용 교차검토 msg_4cd2edc18fa2 인수. 기존 BFF visitorEvent에서 원본 pageview+미등록 이탈event를 단일 요청으로 받아 같은 API에 pageview204 완료 후 event를 순차 전달할 수 있다. 원본 token/sessionId/pageViewId와 서로 다른 eventId·metadata/utm, 좁은 type 허용, 전체본문 한도·JSON MIME·동일Origin·쿠키 미전달·내부헤더를 보존한다. 첫 비204면 둘째를 보내지 않고 오류를 보존하며 완료 전204를 주지 않는다.
- 2026-11-07: API 검토 한계: 수신한 BFF 요청 안의 순서만 보장하며 beacon 큐 승인은 DB 저장 ACK가 아니다. 프로세스/네트워크 종료의 영속·원자성 보장을 추가하지 않는다. API의 기존 서명/만료/publicId·session/visitor/page 바인딩·target 소유 검증과 rate limit(120 visitor/min·240 source/min·500/view) 및 중복 멱등성을 그대로 둔다. 읽기전용 worker는 runtime 검증 not-run이며 Web의 수정전/후 실제근거를 기다린다.
- 2026-11-07: Web msg_5c352c903e4c의 수정 전 실제 재현을 인수했다. 슬롯2 production Next+기존 API/PostgreSQL에서 원본 pageview204를 브라우저 fetch 반환 직전 보류하고 즉시 다른 origin 루프백 HTTP 문서로 이동했을 때 DB page_view1/click0이었다. 실패근거는 .local/telemetry0205/before-db/report.json·results trace/PNG에 보존했다. 앞선 before/before-document는 외부 fixture HTML charset 누락으로 인한 한글 깨짐 준비 실패로 분리한다. 기존 SIM-01은 변경하지 않았으며 Web이 runtime을 계속 소유한다.
- 2026-11-07: Web msg_c853ff8b65c3 및 최초/최종 API 읽기대조 msg_d82132e5c94a succeeded/settled를 부모가 인수했다. 변경8파일과 [영역 근거](../../../apps/web/docs/visitor-telemetry.md)를 읽어 원본 등록 payload 보존·한 요청의204 후 순차 전달·오류/바인딩/한도/쿠키 경계·navigation 불변을 확인했다. API/shared/DB와 기존 SIM-01은 변경하지 않았다.
- 2026-11-07: PM이 실제 JSON을 직접 읽었다. tests/e2e/.local/telemetry0205/after-personas-final/report.json expected5, .local/telemetry0205/.local/telemetry0205/three-engines/report.json 및 upstream-three-engines/report.json 각각 expected3·unexpected/flaky/skipped0이었다. 수정전/수정후 DB1/0→1/1·두 upstream지연 구간·중복2회1행·첫403후행0 근거와 한계를 인수했다. 앞서 기록한 before-db JSON의 정확한 경로도 tests/e2e/.local/telemetry0205/before-db/report.json이다.
- 2026-11-07: 임시proxy3221·실행파일5개·Ego·수동합성계정 정리를 인수하고 슬롯2 runtime을 PM에 반환했다. Docker socket/DB 일시 중단은 원인 미확정으로 분리했다. PM이 반환된PID67490이 next-server인 것을 확인한 후 종료하고 최종 pnpm verify8단계 통과(API263/Web99/guard18)를 확인했다. production Web5393은 density-final-web으로 재기동했다. 전체원격CI는0201에서 확인한다.
