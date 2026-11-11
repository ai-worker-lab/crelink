# 공개 랜딩 방문 계측

기준은 [방문자 행동 설계](../../../docs/specs/crelink-visitor-data.md)와 [`packages/shared/src/telemetry.ts`](../../../packages/shared/src/telemetry.ts)입니다. 이 문서는 0181 수집 구현을 설명하며 당시에는 새 조회 화면을 포함하지 않았습니다. 이후 0188에서 크리에이터 본인·관리자 통합 지표·통계를 구현했으며 현재 조회 흐름은 [지표·통계 안내](analytics.md)에 있습니다. 운영 데이터 조회·배포는 두 작업 범위에서 제외합니다.

## 경계와 데이터

- 공개 `/p/[publicId]`의 서버 응답에 `passAccepted`, `telemetryToken`, `telemetrySessionKey`가 함께 있을 때만 `VisitorTracker`를 마운트합니다. 재사용되는 `Landing`, 홈 예시, 관리 미리보기에는 수집기를 두지 않습니다.
- 서버에서 `readLandingUtm`으로 `utm_source`, `utm_medium`, `utm_campaign`, `utm_id`, `utm_term`, `utm_content`만 고릅니다. 공개 주소에서 단축 주소로 보내는 리디렉트에도 같은 값만 보존하며, 통과 표시는 기존 `PassCleanup`이 제거합니다. 브라우저 수집기는 주소 쿼리를 다시 읽지 않습니다. 채널별 짧은 주소(`/s/{code}`)로 들어온 방문은 주소창에 UTM 대신 `via={code}`만 남고, 이때는 공개 랜딩 API가 `via`를 확인해 내려 준 `utm`(저장 프리셋)을 서버가 `VisitorTracker`에 넘깁니다. 통과 표시가 없는 `via` 주소는 `shortUrl`(`/s/{code}`)로 돌려보내며 이때 UTM을 주소에 붙이지 않습니다. 다른 페이지의 code나 형식이 틀린 `via`는 API가 무시해 기존 동작과 같습니다. 근거 [채널별 짧은 주소 설계](../../../docs/specs/channel-links.md).
- `data-visitor-kind`·`data-visitor-id`로 표시한 블록·링크·SNS·포트폴리오·크리에이터 배너·광고 배너만 대상으로 삼습니다. 목적 URL·제목·화면 글자·폼 입력값은 읽거나 전송하지 않습니다.
- 언어·시간대·viewport/screen 크기·픽셀 비율은 최초 페이지뷰에서 허용한 키와 범위로만 보냅니다. 이 값은 브라우저의 보고이며 실명·정확한 위치·사람 방문의 증명이 아닙니다.
- API는 서명 토큰으로 기존 익명 단축 방문에 연결합니다. BFF는 수집 경로에 클라이언트 IP 헤더를 넘기지 않고, 로그인 쿠키는 본인 방문 표시(0233)를 위해 랜딩 이벤트에 `cl_session`만 넘깁니다. 가입 경로 합계에는 넘기지 않습니다.

## 이벤트와 수명주기

- `page_view`: 문서에 수집기가 설치될 때 한 번입니다. React StrictMode의 효과 재설치는 동일한 페이지뷰를 유지합니다. 뒤로 가기 캐시의 `pageshow.persisted` 복원은 새 `pageViewId`로 기록합니다.
- `sessionId`: 페이지와 기존 익명 방문자의 `telemetrySessionKey`별 `sessionStorage`에 임의 UUID와 마지막 활동 시각을 둡니다. 서명 토큰을 브라우저에서 파싱하지 않으며 같은 익명 방문자는 토큰이 달라져도 세션을 재사용합니다. 쿠키 삭제·차단으로 익명 방문자가 바뀌면 남아 있는 저장소·문서 메모리의 이전 세션을 재사용하지 않습니다. 보이는 문서의 활동·15초 누적 전송이 세션을 연장하고 30분 유휴 뒤에는 새 세션·페이지뷰를 만듭니다. 저장소 거부·손상 시 현재 문서의 메모리 세션으로 처리합니다.
- `click`: 표시된 실제 앵커의 기본 클릭(키보드 포함)과 가운데 버튼 클릭입니다. 기본 이동을 취소하거나 기다리게 하지 않습니다. 기존 `/c`, `/b`, `/a` 리디렉트 집계는 유지하며 신규 이벤트와 더하지 않습니다.
- `impression`: 대상의 절반 이상이 화면에 들어왔을 때 페이지뷰별·대상별 한 번입니다. 블록은 긴 링크 목록의 일부 항목이 보이면 한 번 기록합니다. 숨긴 탭·`inert` 캐러셀 장·`aria-hidden` 영역은 제외하고 DOM·가시 상태 변경 후 다시 관찰합니다. 최소 노출 시간이나 읽음 여부를 뜻하지 않습니다.
- `engagement`: 보이는 동안의 누적 밀리초와 문서 높이 대비 화면 아래 끝까지 도달한 최대 비율입니다. 숨긴 시간은 제외하며 15초마다, 숨길 때, 나갈 때 전송합니다. 짧은 문서는 처음부터 스크롤 100%가 될 수 있습니다. API는 누적값을 합산하지 않고 최댓값을 보관합니다.

## 전송과 실패

`POST /api/backend` 뒤의 공유 `landingEvents(publicId)` 경로를 사용합니다. 최초 `page_view`가204로 수락될 때까지 일반 후속 이벤트를 최대256개만 메모리에 둡니다. 최초 등록의 네트워크 오류·5xx는 같은 `eventId`로 한 번 재시도하고, 입력 오류·서명 거절·429 등은 반복하지 않습니다. 후속 클릭·종료 전송은 JSON Blob의 `sendBeacon`, 큐에 넣지 못하면 `fetch`의 `keepalive`를 사용합니다. 그 밖의 전송도 실패를 화면이나 콘솔에 노출하지 않습니다.

등록 응답을 아직 받지 못한 클릭·종료 engagement는 메모리에서 응답을 기다리지 않고 원본 `page_view`와 이벤트 하나를 `{ pageView, event }`로 묶어 기존 BFF에 즉시 보냅니다(0205). BFF의 `forwardVisitorEvent`는 원본 등록을 기존 단일 이벤트 API로 보내 실제204를 기다린 뒤에만 후속 이벤트를 전달하고 최종 응답을 반환합니다. 원본 토큰·세션·페이지뷰 ID가 같고 eventId가 달라야 하며, 두 번째 타입은 click/engagement만 허용합니다. 최초 등록의 metadata·UTM·eventId를 재생성하지 않습니다. 최초 등록이204가 아니면 후속 호출 없이 원오류를 반환하며 중계 안에서 재시도를 추가하지 않습니다.

BFF는 허용 경로와 같은 출처를 확인하고 **묶음 전체**를 JSON16KiB까지 읽습니다. 해당 경로에서만 Origin을 API로 전달하고 클라이언트 IP와 `cl_session` 외의 쿠키를 전달하지 않으며 API가 설정된 웹 출처·서명·대상·권한·만료·입력 한도·rate limit을 각 단일 이벤트에 그대로 적용합니다. 원본 등록과 중계 등록이 겹쳐도 기존 eventId/pageViewId 멱등 처리가 중복 행을 막지만 중복 등록도 rate 예산을 소비하므로 등록 완료 뒤에는 묶지 않습니다.

보장 범위는 **BFF가 수신한 한 요청 안에서 성공한 page_view → 후속 이벤트의 순서**입니다. 링크 기본 이동을 취소하거나 등록 완료까지 지연하지 않습니다. Beacon의 큐 수락은 BFF 수신이나 DB 저장 ACK가 아니며, 브라우저 강제종료·오프라인·서버 종료·네트워크 실패까지 영속 전달을 보장하지 않습니다. 첫 등록만 저장되고 뒤 이벤트가 실패할 수도 있으며 원자적 일괄 저장이 아닙니다. 등록 대기 중 일반 노출 등 메모리 이벤트는 여전히 종료 시 누락될 수 있습니다. 영구 큐·서비스워커·무제한 재시도는 없습니다.

## 확인

`node --test src/lib/visitor-telemetry.spec.ts src/lib/api/visitor-event.spec.ts`를 `apps/web`에서 실행합니다.30분 경계·저장소 거부/손상·StrictMode 재설치·BFCache·체류·노출·메타데이터·등록 재시도·JSON/UTF-8 16KiB와 BFF의204 순서·첫 실패 원오류 보존·잘못된 묶음의 upstream 호출 금지를 검사합니다. 실제 브라우저 이벤트 순서와 행 저장은 격리 환경에서 검증하며 기존 [0181](../../../docs/work/orchestrator/0181-visitor-data.md)과 후속 [0205](../../../docs/work/web/0205-pending-click-delivery.md)에 연결합니다.

### 0205 실제 실행 근거(2026-11-07)

- 환경: density checkout 슬롯2, macOS arm64·Node24.18.0·Next16.4.1 production `next build`/`next start`, 실제 API3220·PostgreSQL5652·Web5393. 실제 휴대폰이나 운영 데이터가 아니다.
- 수정 전: `pnpm e2e personas --project=personas --no-deps -g SIM-05`에 HTML/JSON reporter와 output 경로를 지정했다. 실제 pageview 등록204를 브라우저 fetch 반환 직전에 보류하고 다른 origin의 실제 루프백 HTTP 문서로 이동했다. PostgreSQL page_view1/click0에서 실패했다. 단순 코드 추론이 아닌 문서 이탈/DB 관찰이다.
- 수정 후: 같은 원인 회귀에서 원본 요청 전 보류(DB anchor0)와 실제204 반환 후 보류(anchor1)를 구분했고 두 경우 모두 외부 문서 이동 뒤 page_view1/click1·정확한 링크 target·동일 visitor/session/pageview/source 바인딩을 확인했다. 동일 eventId를 두 번 재전송해도 한 행씩이며 첫 등록의 잘못된 서명403에서는 후속 행0이었다.
- 추가 실제 중계 검증: Web 프로세스의 API_INTERNAL_URL만 루프백 timing proxy3221로 향하게 했다. 실제 API 등록 **전**과 실제204 응답 **후**를 각각 보류한 상태에서 외부 문서 이동 완료·DB click0를 확인하고, 그 뒤 upstream을 해제해1/1 저장을 Chromium/WebKit/Firefox에서 확인했다. 브라우저 문서가 파괴된 뒤에도 수신한 BFF 요청이 순차 전달을 마친 증거이며 영속 큐 증거는 아니다. 임시 proxy·설정/spec은 검사 후 제거했다.

| 검사 | 결과 | 실제 JSON 경로(checkout 상대) |
| --- | --- | --- |
| 수정 전 DB 재현 | expected0/unexpected1 | `tests/e2e/.local/telemetry0205/before-db/report.json` |
| 기존 SIM01 불변 포함 personas | expected5/unexpected0/flaky0/skipped0 | `tests/e2e/.local/telemetry0205/after-personas-final/report.json` |
| 신규 SIM05 3엔진(각 요청/응답 보류) | expected3/unexpected0/flaky0/skipped0 | `.local/telemetry0205/.local/telemetry0205/three-engines/report.json` |
| 실제 upstream 지연 3엔진(각 등록 전/응답 후) | expected3/unexpected0/flaky0/skipped0 | `.local/telemetry0205/.local/telemetry0205/upstream-three-engines/report.json` |

HTML은 `.local/telemetry0205/{before-db,after-personas-final,three-engines,upstream-three-engines}/html/index.html`, PNG/trace/첨부 DB·중계 순서 JSON은 각 같은 이름의 `results/`에 있다. JSON reporter의 상대 경로는 config 위치 기준이어서 표의 중첩 경로에 실제 저장됐다. 후속 실행은 절대 JSON 경로를 사용한다.3엔진은 기존 personas spec의 SIM05만 일회성 config로 선택했으며 CI 선택·기존 SIM01 assertions·기본 timeout/retry/filter/skip을 바꾸지 않았다.

영역 검사: `pnpm --filter @crelink/web build`, `pnpm --filter @crelink/web typecheck`, 변경 TS5개의 `pnpm exec eslint`·`prettier --check`가 최종 exit0, `pnpm --filter @crelink/web test`99/99, 영향 telemetry unit16/16이었다. 전체 final verify·원격 CI는 PM 담당이다. 최초 타입 검사1회는 테스트에서 ES2022 lib에 없는 Promise.withResolvers를 써 실패했고 기존 target 호환 코드로 고쳤다. 초기 재현2회는 합성 HTTP 문서 charset 누락으로, 중간 수정 후1회는 Playwright beacon 요청 관찰에 의존한 테스트로 실패했으며 원본 pageview 캡처+DB eventId 재전송으로 보강했다. 이 실패들을 최종 통과로 집계하지 않고 원본 artifact를 보존했다.

수동 Ego TaskSpace3에서 합성 공개 랜딩→개인정보 안내 링크 이동과 실제 DB page_view1/click1도 확인했다. `.local/telemetry0205/manual-public.png`를 직접 검토했고 TaskSpace는 finish했다. 전용 수동 합성 user1개는 정확한 ID로 정리해 잔여0(`manual-cleanup.json`), E2E 계정은 fixture가 정리했다. 정리 중 DB5652 연결 거절과 host Docker socket 부재를 관찰했으나 전역 데몬은 조작하지 않았다. 부모의 환경 복구 관측 뒤 해당 ID 잔여1을 확인해1개 삭제했으며 원인은 미확정이다.

마지막에는 proxy3221·계측용 Web을 종료하고 일반 API 경로의 production Web 서비스 `telemetry0205-web-final`을 유지했다. API readiness200, Web privacy200, Web BFF health200을 관찰했다. 기존 API 프로세스32402의 일반 dist/main 호출은 변경하지 않았고 preload는 추가하지 않았다. 런타임을 PM에 반환하며 다시 빌드하기 전 이 Web 서비스를 중지해야 한다. 브라우저/서버 강제종료·오프라인·실물 휴대폰은 미검증이며 자동 merge/deploy를 하지 않았다.

최종 정리 뒤 `pnpm docs:check`는 Markdown304개 검사 exit0, 변경 TS5개의 `prettier --check`도 exit0이었다. 일반 Web 서비스는 persistent로 인계한다.
