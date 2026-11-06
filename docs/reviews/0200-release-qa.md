# 0200 출시 QA 근거

## 범위·환경

- 작업: `tests/e2e/**`·이 보고서만 QA 소유. 제품 수정은 web/PM 소유.
- localhost 전용: 웹 `http://127.0.0.1:5293`, API·단축 URL `http://127.0.0.1:3120`, PostgreSQL17 `127.0.0.1:5552`. 운영 DB/계정/외부 사용자 접근 없음.
- macOS25.6 arm64, Node24.18.0, pnpm10.10.0, Playwright1.64.0. 전용 `make infra-up web-up` 및 `make api-up`으로 Next dev/API start:dev 실행, 공용 패키지 tsc 완료. API에는 외부 Instabio 두 URL만 대체하는 시험 preload를 프로세스 환경으로 주입했다.
- 기본 fixture는 합성 계정·지표 제외·loopback 제한·실행 소유 데이터 정리를 유지한다. SIM-02 지표 포함 대조군은 localhost 합성 계정이며 실제 고객/성장 증거가 아니다.
- 최종 3엔진 버전: Chromium156.0.8078.4, WebKit27.2, Firefox157.0. Chromium Pixel7·WebKit iPhone13Pro 프리셋/Firefox touch viewport이며 실제 휴대폰이 아니다.

## 변경

- `tests/e2e/personas.spec.ts`: 기존 SIM-01에 첫 저장503→입력/DB 보존→실제 재시도→새로고침→공개 방문/브라우저 클릭→본인 수집 페이지뷰/클릭 통계를 연결. SIM-03에 타 계정 통계 격리/관리자 통계403·본인 조회에 타인 조건400 추가. 기존 SIM-04 만료 세션/마지막 성공값 보존 재사용.
- `tests/e2e/link-layout.spec.ts`:3열 기대를2열로 대체, 리스트 저장/새로고침·카드 실패 복구 유지.320/390/768/1280·844×390·글자200% 확대·사진/이미지없음·긴 제목·배너 전체 열·axe JSON·환경 첨부·Linux Chromium 시각 비교 추가.
- `tests/e2e/instabio-import.spec.ts`·`instabio-source.mjs`: 외부 원본만 고정 fixture로 제공하고 실제 BFF/API/DB로 원본 미리보기 무변경·중복 제외 추가·기존 프로필/링크/grid 보존·반응형 초안 보존·공개 결과 검사. 내부 저장 응답을 mock하지 않는다.
- `tests/e2e/visitor.spec.ts`: 통과 토큰 내부 문자열 형식을 고정하던 정규식 한 줄 삭제. 리디렉트 체인·최종 URL 토큰 제거·방문 수/slug/referrer는 그대로 검사한다. API 서명·만료·위변조 검사를 변경하지 않는다.
- `tests/e2e/fixtures.ts`: 늦은 방문자 beacon과 사용자 CASCADE 정리의 교착을 실제 관측하여 소유 `landing_events`를 먼저 잠그고 같은 transaction에서 사용자 삭제. 전역 테이블 잠금·telemetry 비활성화·retry는 추가하지 않는다.
- `tests/e2e/README.md`: 실제 순차 CI 명령/JSON·HTML·PNG·trace/외부 fixture 준비/시각 baseline 승인 경계 문서화. 루트 변경 기록·CI/package/lockfile은 PM 담당.

## 실행 기록

| 실행 | 결과 | 근거 |
| --- | --- | --- |
| `pnpm e2e --config tests/e2e/link-layout.config.ts --reporter=list,json --output=.local/e2e/layout-results` |3 passed·0 failed·0 flaky,15.0s | `.local/e2e/layout-results/` PNG·axe JSON, 실행 출력 JSON |
| 첫 core/personas 선택(파일 앞 경계 미고정) |13 passed·1 failed,35.2s,exit1 | JSON `tests/e2e/.local/e2e/core/report.json`, HTML/trace `.local/e2e/core/` |
| 파일 앞 경계를 고정한 core-final 선택 |8 passed·1 failed,약2.2m,exit1 | JSON `tests/e2e/.local/e2e/core-final/report.json`, HTML/trace `.local/e2e/core-final/` |
| web 수정 후 Instabio 집중 실행 |동작 완료·teardown deadlock1 failed,exit1 | JSON `tests/e2e/.local/e2e/import-fixed/report.json`, HTML/trace `.local/e2e/import-fixed/` |
| fixture 잠금 순서 수정 후 동일 Instabio `--repeat-each=3 --workers=1` |3 passed·0 failed·0 flaky,8.2s | JSON `tests/e2e/.local/e2e/import-final/report.json`, HTML `.local/e2e/import-final/html/index.html` |
| preload 비활성/활성 localhost/비로컬 거부 throwaway Node assert |비활성 원래 fetch 보존0·활성 두 URL fixture/기타 원래 fetch 전달0·비로컬 경계 거부1 | 네트워크 호출 없이 sentinel fetch로 실행 |
| scoped Prettier·ESLint |pass | 영구 변경 TS/MJS 및 visitor 대상 |
| 최종 core9개 |9 passed·0 failed·0 flaky,25.3s | JSON `tests/e2e/.local/e2e/core-accepted/report.json`, HTML/PNG `.local/e2e/core-accepted/` |
| 최종 personas4개 |4 passed·0 failed·0 flaky,4.2s | JSON `tests/e2e/.local/e2e/personas-accepted/report.json`, HTML/PNG `.local/e2e/personas-accepted/` |
| 최종 analytics3엔진12개 |12 passed·0 failed·0 flaky,52.5s | JSON `tests/e2e/.local/e2e/analytics-accepted/report.json`, HTML/PNG `.local/e2e/analytics-accepted/` |
| 최종 layout3엔진3개 |3 passed·0 failed·0 flaky,13.0s | JSON `tests/e2e/.local/e2e/layout-accepted/report.json`, HTML/PNG `.local/e2e/layout-accepted/` |
| Ego 실화면 검토용 일회성 fixture |1 passed,4.5s | `.local/e2e/manual-results/manual-review-일회성-Ego-공개2열-실화면-검토-main/ego-public-390.png` |
| 문서화한 절대 reporter 경로의 personas 명령 |4 passed·0 failed·0 flaky,4.3s | `.local/ci/e2e/personas/report.json`, `.local/ci/e2e/personas/html/index.html` 존재 확인 |

첫 core의 파일 선택은 `operator`가 `ai-operator`에도 매칭하여 기존 AI 운영자 로컬 fixture 시나리오1개를 의도치 않게 실행했다(통과, 운영 접근 아님). 이후 선택은 `(^|/)(creator|visitor|operator|notices|guestbook|instabio-import)\.spec\.ts$`로 고정해9개만 선택한다. personas는 별도 프로젝트4개, analytics는3엔진×4화면12개, layout은3엔진×1개다.

최종28개는 아래 선택을 같은 DB에서 `&&`로 순차 실행했다. 각 호출에 `--reporter=list,html,json --output=.local/e2e/<suite>/results` 및 `PLAYWRIGHT_HTML_OPEN=never`, HTML 경로 `.local/e2e/<suite>/html`, JSON 이름 `.local/e2e/<suite>/report.json`을 넘겼다. **상대 JSON 이름은 configDir 기준이므로 실제 출력은 위 표의 `tests/e2e/.local/…`**다. 이 차이를 발견해 CI/README에는 `$PWD` 또는 `$GITHUB_WORKSPACE` 절대 경로를 넘기도록 인계했고 마지막 personas 호출로 해당 경로의 JSON/HTML 생성을 실제 확인했다.

```sh
pnpm e2e '(^|/)(creator|visitor|operator|notices|guestbook|instabio-import)\.spec\.ts$' --project=main --no-deps
pnpm e2e personas --project=personas --no-deps
pnpm e2e --config tests/e2e/analytics-responsive.config.ts
pnpm e2e --config tests/e2e/link-layout.config.ts
```

layout 폭320/390/768/1280·가로844×390·글자200%/320px. analytics 폭320/360/390/700/701/768/844/1280/1440. Instabio 폭320/390/768/1023/1024/1023/1024/1280에서 실제 dialog 모드 전환 뒤 미리보기·선택·수정 제목·프로필 교체·저장 버튼 보존을 확인했다.

### 실패·결함

1. 첫 core 실패는 visitor의 토큰 내부 형식 고정 assertion이었다. 실제 토큰은 timestamp/UUID/signature인데 기존 assertion이 두 조각만 허용했다. 해당 우연한 구현 검사를 삭제한 뒤 core-final에서 visitor2개는 통과했다.
2. core-final의 Instabio:1280에서 미리보기2개를 읽고320→390→1280 전환 후 details가 닫히고 저장 버튼이 사라져120초 timeout. 기대는 미리보기·선택·수정 제목 유지. 담당은 `apps/web/src/components/manage/InstabioImport.tsx`와 반응형 패널 렌더러이며 부모에게 trace/error-context를 인계했다. 첫 실행 통과/다음 실행 실패이므로 반응형 전환 경주를 숨기지 않고 dialog 가시성/제거로 모드 전환 완료를 기다리는 회귀로 보강했다.
3. core-final 뒤 `&&`로 연결했던 personas/analytics는 앞선 실패로 실행되지 않았다. 실패 실행을 성공으로 집계하지 않는다.
4. web worker가 가져오기 초안을 안정된 PageEditor 소유로 올린 뒤1023↔1024를 반복 전환하며 미리보기/선택/수정 제목/프로필 교체/저장 버튼과 실제 공개 저장 결과가 유지됨을 관측했다. 첫 수정 후 실행은 teardown에서 별도 deadlock으로 실패했다.
5. PostgreSQL 로그에서 `DELETE users`의 `landing_events` CASCADE와 동시 `INSERT landing_events`의 short_link FK 잠금 순서 충돌을 확인했다. fixture의 최종 삭제를 소유 이벤트 `ORDER BY event_id FOR UPDATE OF e`→사용자 삭제의 같은 transaction으로 맞췄다. 동일 실제 방문/저장 시나리오3회와 teardown은 모두 통과했으나 모든 비동기 타이밍을 결정적으로 열거한 증거는 아니다. 실패 잔여 사용자1개는 해당 실행의 정확한 소유 UUID와 `.test` 표식 조건으로만 삭제했고 해당 ID 잔여0을 확인했다.

## 시각·접근성·미검증

- 공개390px PNG를 직접 열어2열·배너 전체 열·이미지 대체 아이콘·긴 제목 줄바꿈을 확인했다. 파일: `.local/e2e/layout-results/link-layout-생성자-표시-설정-저장·미리보기·공개-그리드·모바일·실패-복구-chromium/visitor-390.png`.
- Ego TaskSpace `crelink-0200-release-qa`(8)의 실제 localhost 공개 페이지를390×844로 열어2열·긴 제목 줄바꿈·이미지 없는 대체 아이콘과 링크 접근 가능한 이름을 확인했다. PNG를 직접 열어 검토했고 `finish({keep:[]})` 완료, 임시 `manual-review.spec.ts` 삭제 완료. 프로필 조회는 하지 않았다. Ego Lite 업데이트 알림은 있었으나 업그레이드는 실행하지 않았다.
- 최종 WebKit320px 글자200% PNG와 creator metrics WebKit/운영자 stats Firefox 모바일 PNG를 직접 열어 카드 경계·긴 제목 보존·날짜 입력의 세로 분리/조회 조작·계정 조건 표시를 확인했다. 원본은 각각 `.local/e2e/layout-accepted/results/`·`.local/e2e/analytics-accepted/results/`에 있다.
- axe는 Playwright 공식 지침의 `@axe-core/playwright`4.14.0, WCAG2/2.1 A/AA를 사용한다. 공식 출처: [접근성](https://playwright.dev/docs/accessibility-testing), [동일 환경 시각 비교](https://playwright.dev/docs/test-snapshots). 자동검사로 수동 스크린리더 평가 전체를 보증하지 않는다.
- **Linux screenshot baseline 비교는 not-run**. PM 합의: Ubuntu24.04/lockfile Playwright1.64.0 Chromium에서 missing-baseline 실패 artifact actual PNG를 직접 검토한 뒤 `tests/e2e/link-layout.spec.ts-snapshots/public-two-column-chromium-linux.png`를 명시 추가하고 같은 환경 일반 실행으로 비교한다. macOS baseline 대체/실패 자동승인/임의 허용 픽셀 증가는 하지 않는다.
- 실제 Google OAuth·Instagram 인앱·실물 iOS/Android·OS 확대/브라우저 페이지 배율·외부 live Instabio/이미지 다운로드는 **not-run**. fixture Google 신원/세션은 OAuth 연동 증거가 아니며 외부 클릭은302 목적 주소/브라우저 요청만 검증한다.
- 통합 CI·음성 gate·PR·Linux baseline 승인/정상 비교·출시 최종 판정은 PM 담당이다.

## 현재 인계 상태

로컬 요청 범위의 최종28개와 집중3회·Ego 검토·정리·절대 reporter 경로 확인은 완료했다. 합성 사용자 잔여를 localhost DB에서 조회해0을 확인했으며 임시 spec은 제거했고 모든 실패/정상 artifact는 보존했다. 신규 영구 spec은 `instabio-import.spec.ts` 하나이며 `release-qa.spec.ts`는 없다. Chromium/WebKit/Firefox config는 그대로 유지했다.

전용 PostgreSQL/Valkey·PM2 `crelink-web`(Next dev)·`crelink-api`(start:dev)는 실행 상태로 PM Dispatch `ctx_08594edcf659`에 런타임 소유권을 인계한다. API 프로세스에는 `CRELINK_E2E_INSTABIO=1`과 `NODE_OPTIONS=--import <checkout>/tests/e2e/instabio-source.mjs`, 네 loopback 대상 환경변수가 남아 있다. 일반/운영 시작 설정은 변경하지 않았다. PM 인수 뒤 QA는 추가 런타임 실행하지 않는다.

남은 출시 gate는 PM의 Linux actual PNG 검토/기준선 명시 추가/정상 비교, 통합 CI·음성 gate·PR 검증이다. 이 항목을 로컬 macOS 통과로 대체하지 않으며 baseline 미승인 상태에서 전체 출시 QA 완료를 주장하지 않는다.
