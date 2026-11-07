# 0204 리스트 밀도 실제 API·DB·3엔진 QA

- 판정: 로컬 수용 기준 통과. 제품 코드 수정이 필요한 결함은 발견하지 않았다. Linux 시각 기준선·최종 CI 및 사람의 PR 검토는 PM 담당이며 이 보고가 배포 승인은 아니다.
- 실행: 2026-11-07, provider `omp`, model `openai-codex/gpt-6.1-sol`.
- Task `task_8e81637eb6bc` / Dispatch `ctx_bbb0521a5634`, Run `run_70499bf44220`.
- 기준: [설계](../specs/list-density.md), [QA 티켓](../work/crelink-qa/0204-list-density-qa.md).
- checkout 절대 경로: `/Users/shaul/orca/workspaces/crelink/list-density-20261107`.

## 변경 파일

production·shared·CI·티켓·루트 문서는 편집하지 않았다.

- `tests/e2e/list-density.spec.ts`: 사용자 저장·공개/미리보기·실측·오류/경합·가져오기·실제 만료 세션 회귀2개.
- `tests/e2e/link-layout.config.ts`: 기존3엔진 선택에 밀도 spec 추가. 총9개(기존3+밀도6).
- `tests/e2e/link-layout.spec.ts`: 저장 안내의 기존 문구 고정 검사 제거. 성공은 실제 grid/list·공개 상태로, 실패는 alert·이전 선택 복구로 검사한다. Linux baseline·조건·허용치·axe는 변경하지 않았다.
- `tests/e2e/instabio-import.spec.ts`: 비기본12가 실제 가져오기 후 보존됨을 검사.
- `tests/e2e/fixtures/list-density-landscape.jpg`:240×160 오프라인 실사진 fixture. 출처/라이선스는 아래 README.
- `tests/e2e/README.md`: 밀도 시나리오·API 전용 preload 선행 조건·사진 출처·한계.
- `docs/reviews/0204-list-density-qa.md`: 이 보고.
- `docs/reviews/0204-list-density/measurements.json`:3엔진 실제 측정 원문.
- `docs/reviews/0204-list-density/chromium-8.png`, `chromium-10.png`, `chromium-12.png`, `chromium-comparison.png`.
- `docs/reviews/0204-list-density/webkit-8.png`, `webkit-10.png`, `webkit-12.png`, `webkit-comparison.png`.
- `docs/reviews/0204-list-density/firefox-8.png`, `firefox-10.png`, `firefox-12.png`, `firefox-comparison.png`.

위 PNG 이름의 축약은 모두 같은 `docs/reviews/0204-list-density/` 아래 파일을 뜻한다. 실행 로그/HTML/JSON·실패 trace·추가 PNG는 이 checkout의 `.local/qa0204/`에 보존했다.

## 환경·실행 모드

- macOS arm64, Node24.18.0, Next16.4.1. `pnpm instance`로 슬롯2의 Web5393/API3220/PostgreSQL5652를 확인했다. 다른 checkout/운영에는 접근하지 않았다.
- Web: `pnpm --filter @crelink/web build` exit0 후 `pnpm --filter @crelink/web exec next start --hostname 127.0.0.1 --port 5393`. dev 서버가 아닌 production build를 검사했다.
- Web 로그에는 `output: standalone`에서 `next start` 대신 standalone server를 권장하는 경고가 있다. 실제 HTTP200·모든 회귀는 통과했지만 standalone 배포 artifact 기동 자체의 증거는 아니다. 실행 중 `.next`를 다시 빌드하기 전 아래 서버를 중지해야 한다.
- API: 최초 기존 managed `nest start --watch`. 가져오기 검사 전 `make api-down`, `apps/api`에서 `CRELINK_E2E_INSTABIO=1 node --env-file=../../.local/instance.env --import ../../tests/e2e/instabio-source.mjs dist/main.js`로 실제 built API 실행. 외부 합성 Instabio2개 URL만 preload로 대체했다. 내부 HTTP/BFF/인증/DB는 실제 경로다.
- Playwright Chromium156.0.8078.4, WebKit27.2, Firefox157.0. Chromium Pixel7·WebKit iPhone13Pro 프리셋, Firefox touch 조건. 실제 휴대폰이 아니다.
- 밀도 조건: 관리390×844, 공개390×740, 동일 한줄 제목14개·같은 비정사각형 실사진14개. 반응형320/390/768/1280×844 및320px 글자200%. 기존 grid suite의844×390·axe·2열/배너 검사도 실행했다.
- 수동 검토: Ego TaskSpace1 `crelink0204-density-QA` 하나에서 실제 편집 패널의12 선택/성공 안내와 공개 기본아이콘·사진 화면을 열고 PNG를 직접 검토했다. 프로필 조회/선택은 하지 않았다. 실제390px DOM의 `innerWidth=390`, `scrollWidth=390`도 관찰했다.

## 명령·최종 결과

각 suite는 같은 DB에서 **core → personas → analytics → layout** 순서로 실행했다. 마지막에 설명 selector와44px label·200% 내용 잘림 assertion을 보강하여 layout만 다시 실행했다. JSON `expected/unexpected/flaky/skipped`를 직접 대조했다. 자동 retry/skip·오류 필터·시각 허용치를 완화하지 않았다.

공통 reporter 인자:

```sh
PLAYWRIGHT_HTML_OPEN=never
PLAYWRIGHT_HTML_OUTPUT_DIR="$PWD/.local/qa0204/regression/<suite>/html"
PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.local/qa0204/regression/<suite>/report.json"
# 위 세 값을 환경으로 전달하고 아래 명령에 붙임
# --reporter=list,html,json --output="$PWD/.local/qa0204/regression/<suite>/results"
pnpm e2e '(^|/)(creator|visitor|operator|notices|guestbook|instabio-import)\.spec\.ts$' --project=main --no-deps
pnpm e2e personas --project=personas --no-deps
pnpm e2e --config tests/e2e/analytics-responsive.config.ts
pnpm e2e --config tests/e2e/link-layout.config.ts
```

| 최종 suite | `--list` 선택 | 실행 | passed | failed | flaky | skipped | 미실행 테스트 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| core |9|9|9|0|0|0|0|
| personas |4|4|4|0|0|0|0|
| analytics3엔진 |12|12|12|0|0|0|0|
| layout/밀도3엔진 |9|9|9|0|0|0|0|
| 보강 후 layout-final |동일9|9|9|0|0|0|0|

최종 통합 시나리오34개 모두 통과, 보강 후 동일 layout9개도 통과. `--list`의 `did not run` 출력은 탐색 전용이며 실행 실패/미실행 건수로 합산하지 않는다. `pnpm exec eslint` 소유4개 TS와 `pnpm exec prettier --write`도 exit0. 전체 `pnpm verify`, `pnpm smoke`, Linux CI는 이번 QA가 실행하지 않았으며 PM 통합 검증 범위다.

`pnpm docs:check`는 이 보고가 진입점 색인에서 아직 연결되지 않아 고아 문서1건으로 실패했다. 링크 대상 자체의 누락 오류는 없었다. `docs/README.md`는 PM 소유이므로 QA가 범위를 넘겨 수정하지 않았으며 PM의 review 색인 연결 뒤 재검사가 필요하다.

### 보고서 절대 경로

| suite | JSON | HTML |
| --- | --- | --- |
| core | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/core/report.json` | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/core/html/index.html` |
| personas | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/personas/report.json` | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/personas/html/index.html` |
| analytics | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/analytics/report.json` | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/analytics/html/index.html` |
| layout | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/layout/report.json` | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/layout/html/index.html` |
| layout-final | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/layout-final/report.json` | `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/regression/layout-final/html/index.html` |

각 같은 suite 디렉터리의 `results/`에 PNG·axe attachment가 있다. core/personas/analytics/layout의 `selection.log`, `run.log`도 보존했다. 서버 로그는 `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/api-server.log`, `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/web-server.log`이다. DB 연결 문자열·운영 credential은 기록하지 않았다.

### 과거 실패와 복원

- 최초 `pnpm e2e --config tests/e2e/link-layout.config.ts list-density ...`는 checkout 경로에 `list-density`가 포함되어9개 전부를 선택했다. 실패9개: 기존 안내 문구 고정3, 최대60자 제목/120자 설명을 넘긴 새 fixture3, Next route announcer와 중복된 alert selector3. 제품 결함이 아니라 테스트의 잘못된 전제였다. fixture는 허용 최대 길이로, alert는 실제 폼 오류로 바꾸고 문구 고정을 제거했다.
- 최초 결과·실패 PNG/trace: `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/impact/results/`. JSON stdout은 당시 tool artifact에 남았으며 이 첫 실행에는 별도 JSON 파일을 지정하지 않았다.
- `impact2`:밀도6개 중3 passed/3 failed. pending 종료에서 `aria-disabled="false"`를 기대했으나 실제는 속성 제거였다. 활성화 의미를 검사하도록 수정했다. `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/impact2/report.json`, 같은 디렉터리 `html/index.html`, `results/**/trace.zip`에 보존.
- 오류 시나리오만 다시 실행한 `errors`3/3, 가져오기/배너 보강 `impact3`6/6, 실사진/미리보기 측정 `impact-final`6/6 통과 후 통합 회귀를 실행했다. 이 세 디렉터리의 절대 경로는 위 checkout의 `.local/qa0204/{errors,impact3,impact-final}/report.json` 및 `html/index.html`이다. 최종 통과에서 실패 trace는 생성되지 않는다(`retain-on-failure` 유지).
- 사진 원본 확보 시 Wikimedia URL403을 관찰했고 해당 원본을 사용하지 않았다. Unsplash의 JPEG를 오프라인 fixture로 저장했다. 서버/DB mock으로 우회하지 않았다.

## 사용자 동작 관찰

- 기본8 선택에서 시작.8/10/12 UI 저장 후 각각 PostgreSQL `landings.list_density`, 실제 creator 응답, 공개 DOM과 미리보기 DOM이 일치. 매 값 reload 보존, 새 무작위 세션 행/새 브라우저 컨텍스트에서도12 보존. OAuth 재로그인 자체는 미검증이다.
- list→grid→list 뒤12 보존. 그리드에는 밀도 속성을 적용하지 않으며 기존2열·배너 전체열·키보드·axe 회귀 통과.
- 비기본10에서12 저장에503·응답 필드 누락·문자열`"12"`·다른 숫자10·null을 주입했다. 매번10 복구·실제 DB10 유지·보이는 오류·가져오기 제목 초안 보존. 자동 재시도 없이 재선택했다.
- 같은 JS 이벤트 루프에서12→10→grid 조작 중 PATCH는1개. 실제 요청을 pending으로 유지한 채1280→390 패널/시트 전환, 선택12와busy 보존. 요청 해제 후 실제 API/DB12·list·기존 프로필/링크 유지. 오류 주입을 제거한 실제 저장 성공으로 복원을 증명했다.
- 가져오기 미리보기 제목을 수정한 채 밀도 오류/재시도·pending 반응형 전환을 거친 뒤 같은 초안을 실제 내부 API로 저장했다. reload 후12와기존 링크/수정한 가져온 제목 보존. 별도 기존 Instabio core에서는 grid/12·기존 프로필 보존도 통과.
- 실제 세션 DB 만료 뒤10 선택은 BFF PATCH401, 브라우저 홈 redirect, DB 마지막 성공값12 보존. 단순 핸들러/응답 mock redirect가 아니다.
- 긴 제목60자·설명120자, 첫 링크 사진 없음/기본아이콘, 다른 행 실사진, 배너가 있는 세 밀도 모두 지정4폭에서 가로 넘침 없음·카드44px 이상·제목/설명 잘림 없음.320px 글자200%에서도 내용은 늘어나고 잘리지 않는다. 행 수 감소는 정상으로 두며8/10/12를 강제로 맞추지 않았다. 밀도 선택 label도44px 이상이다.
- busy 동안 다른 폼/메뉴의 동시 저장을 억지로 허용하지 않았다. 증명 범위는 같은 화면의 기존 프로필/링크 상태·가져오기 편집 초안 보존과 동기 교차 저장 차단이다. 별도 탭에서 동시 외부 수정하는 충돌 병합은 요구/검증 범위가 아니다.

## 실제 치수·화면 근거

3엔진 공개/미리보기 결과가 아래와 같았다. 기준은 전체 뷰포트의 첫 화면이 아니라 **목록 시작점부터740 CSS px**이다. 프로필/탭이 차지하는 첫 화면에서는 적게 보일 수 있다.

| 밀도 | 완전 노출 행 | 카드 높이 | 행 간격 | 마지막 완전행 하단 | 제목 | 사진 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
|8|8|82px|12px|740px|16px 유지|contain|
|10|10|66px|8px|732px|16px 유지|contain|
|12|12|54px|8px|736px|16px 유지|contain|

[측정 원문](0204-list-density/measurements.json). 원본390×740 CSS px 영역 PNG는 스크롤로 목록 시작을 맞춘 실제 캡처다. 모바일 프리셋 DPR 때문에 원본 픽셀 크기는 엔진별로 다를 수 있으며 CSS px 실측과 구분한다.

- Chromium: [8](0204-list-density/chromium-8.png) · [10](0204-list-density/chromium-10.png) · [12](0204-list-density/chromium-12.png) · [나란히](0204-list-density/chromium-comparison.png).
- WebKit: [8](0204-list-density/webkit-8.png) · [10](0204-list-density/webkit-10.png) · [12](0204-list-density/webkit-12.png) · [나란히](0204-list-density/webkit-comparison.png).
- Firefox: [8](0204-list-density/firefox-8.png) · [10](0204-list-density/firefox-10.png) · [12](0204-list-density/firefox-12.png) · [나란히](0204-list-density/firefox-comparison.png).

비교 PNG는 원본을 각390×740 표시 크기로 리사이즈하고48px 제목줄/16px 구분 여백만 붙인 자료다. 화면을 재생성하거나 카드/텍스트/색을 보정하지 않았다. 원본과 DOM 치수를 함께 직접 검토했고 세 엔진의8/10/12 차이·사진 전체 표시·동일 제목 가독성을 확인했다. 생성 시안은 증거로 사용하지 않았다.

수동 Ego 원본은 `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/manual-editor12.png`, `manual-public12.png`, `manual-photo12.png`, `manual-photo12-390.png`에 있다. 이 중390 고정 캡처는 마지막 파일이며 중간 사진 캡처의 뷰포트는788px로 복원된 상태라 모바일390 증거로 사용하지 않는다. 긴 글자/배너 원본은 최종 layout `results/list-density-리스트-밀도-실제-저장·새-세션·공개-미리보기·740px-실측·가독성-{chromium,webkit,firefox}/density-{8,10,12}-long-text200.png`에 보존했다.

## 정리·런타임 반환

- 모든 Playwright fixture의 사용자/세션·링크·업로드 정리 완료. 수동 합성 사용자1명과 소유 업로드1개도 정리했다. 실제 DB 조회 결과 `@e2e.crelink.test` 잔여0. `/Users/shaul/orca/workspaces/crelink/list-density-20261107/.local/qa0204/cleanup.json`에 기록.
- Ego TaskSpace1은 `finish({keep:[]})` 완료. 프로필 전체 cookie/storage를 지우지 않았다.
- 수동 token 상태 파일·사진 임시 다운로드·실행용 임시 `.mjs`4개 삭제. 원본/비교PNG·JSON·HTML·trace·로그만 보존했다.
- preload 서비스 `density-qa-api-fixture`는 종료. `make api-up`으로 일반 PM2 `crelink-api`(`nest start --watch`,3220)를 복원했고 `/api/health/ready`200 `{"status":"ready"}`를 관찰했다. preload/env 변경은 일반 서비스에 남기지 않았다. PostgreSQL5652/인프라는 유지했다.
- Web5393은 production `next start` 서비스 **`density-qa-web`**, PID18495, persistent로 유지했고HTTP200 확인. PM은 `.next`를 재빌드하기 **전에** `proc://density-qa-web/kill`에 쓰거나 `kill 18495`로 이 서버를 중지해야 한다. 다른 checkout의 Web을 건드리지 않는다. 이후 필요 모드로 다시 시작한다.
- 런타임 소유권을 PM Task `task_4d741a24fa67` / Dispatch `ctx_7d0fff206cba`에 반환한다. QA는 더 이상 서버/DB/브라우저를 조작하지 않는다. commit/push·merge/deploy는 하지 않았다.

## 미검증·PM 인계

- Linux Chromium grid baseline 비교는macOS에서 **not-run**. 기존 `maxDiffPixels:0`·기준선 PNG·엔진 조건을 그대로 보존했다. 최종 Linux CI에서 검증해야 한다.
- 실물 iPhone13Pro/Android·Instagram 인앱·실제 OS/브라우저 확대·live Google OAuth·live 외부Instabio/CDN 가용성은 **미검증**. CSS 글자200%·모바일 프리셋을 실물 증거로 설명하지 않는다.
- API worker가 이미 확인한 invalid 입력 표·타인/운영자 권한·구버전 서버 migration 호환을 의미 없이 재실행하지 않았다. 이번 브라우저의 새 세션/실제401·DB/공개·기존 personas 권한 회귀로 연결을 확인했다. 상세 API 증거는0202 티켓이다.
- PM은 티켓 상태·루트 변경 기록·review 색인 연결, 전체 verify/smoke, PR/CI를 처리한다. 새 config의 밀도 오류 suite도Instabio preload가 필요하므로 기존CI의 API 전용 preload를 유지한다. 자동 merge/deploy 대상이 아니다.

## PM 후속 통합 경계

위34개는0204 실행 당시의 고유 시나리오다. 이후 PR149 Linux CI에서 기존 SIM-01 빠른 이탈의 pageview 등록 대기 클릭 유실이 드러나 [0205](../work/web/0205-pending-click-delivery.md)로 제품 경합을 수정했다. 기존 SIM-01 assertion은 유지했고 SIM-05 실제 문서 이탈 회귀1개를 추가했으므로 현재 PR 선택 예상은 core9+personas5+analytics12+layout9=35개다. 최종 실제 개수·Linux baseline·원격 SHA/CI는 [0201](../work/crelink-pm/0201-list-density.md)과 PR149에서 확인한다. 과거34개 근거를35개가 실행됐다는 주장으로 바꾸지 않는다.
