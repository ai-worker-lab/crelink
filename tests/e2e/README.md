# 크리링 MVP E2E

실행 중인 웹·API·PostgreSQL에 [크리링 MVP 기술 설계의 검증 계획](../../docs/specs/crelink-mvp.md#검증-계획) E2E 1~4, [방명록 기술 설계의 검증 계획](../../docs/specs/crelink-guestbook.md#검증-계획), [광고 블록·배너 슬롯 기술 설계의 검증 계획](../../docs/specs/crelink-ad-banner.md#검증-계획) 1~9, [외부 링크 50개·광고 블록 켜고 끄기 기술 설계의 검증 계획](../../docs/specs/crelink-link-limit-ad-toggle.md#검증-계획)을 Playwright로 실행합니다. 화면과 무관한 불변 조건(헬스 체크, 첫 화면 렌더링)은 `pnpm smoke`(`tests/smoke/`)가 맡고, 이 폴더는 화면 시나리오와 웹→API→DB 연결을 확인합니다.

## 실행

```sh
make up                                   # 인프라·API·웹 실행(이미 떠 있으면 생략)
pnpm exec playwright install chromium     # 처음 한 번
pnpm e2e                                  # 전체 시나리오
pnpm e2e operator                         # 파일 이름 일부로 골라 실행(나머지 인자는 playwright test에 그대로 전달)
pnpm e2e personas --project=personas --no-deps # 가상 사용자 다섯 시나리오만
pnpm e2e personas --project=personas --no-deps --debug # 단계별 수동 검토
pnpm e2e analytics-responsive --project=main # 분석 UI 변경만 Chromium으로 검사
pnpm exec playwright install webkit firefox # 아래 다중 엔진 검사 최초 준비
pnpm e2e --config tests/e2e/analytics-responsive.config.ts # 분석 UI만 Chromium·WebKit·Firefox
```

- `scripts/e2e.mjs`가 `WEB_URL`·`API_URL`·`SHORT_LINK_BASE_URL`·`DATABASE_URL`을 환경변수, 없으면 이 checkout의 인스턴스 설정 `.local/instance.env`(`pnpm instance`)에서 읽어 넘깁니다. 실행 전에 API(`/api/health/ready`)·웹·DB 연결과 Chromium 실행을 확인하고, 실패하면 해결 방법을 출력합니다.
- 다른 인스턴스를 검사하려면 네 값을 모두 환경변수로 넘깁니다. API가 `UPLOAD_DIR`을 바꿔 쓰면 같은 값을 `UPLOAD_DIR`로 넘겨야 업로드 파일 정리가 맞습니다(상대 경로는 `apps/api` 기준).
- 운영/원격 대상은 금지합니다. runner와 직접 Playwright fixture 모두 웹·API·단축 URL·DB 전체가 루프백인지 연결/cleanup 전에 검사합니다. DB 연결 대상 query 덮어쓰기도 거부하며 우회 옵션은 없습니다. [분류·수명·시나리오 계약](../../docs/development/user-simulation.md)을 따릅니다.
- 결과·trace는 `.local/e2e/test-results/`에 남습니다(실패 시 `pnpm exec playwright show-trace <trace.zip>`).
- 데스크톱 1280px가 기본이고, 관리 화면 `/me/landings/{publicId}`(`페이지 편집`·`프로필`·`방명록` 메뉴, `편집 | 미리보기` 전환과 하단 시트)·`/p/{publicId}`·`/admin/creators/{id}`는 390px로 다시 열어 가로 넘침이 없는지도 봅니다. 관리 화면은 1024px 이상에서 가운데 무대(region `미리보기`: 주소 막대 + 고르기 버튼이 있는 미리보기)와 오른쪽 편집 패널(`main`, 고르면 패널이 바뀜), 1023px 이하에서 sticky 줄(주소·복사·주소 변경·`편집 | 미리보기`)과 전체 폭 미리보기·하단 시트로 바뀌므로 1280px와 390px 동작을 따로 확인합니다([디자인 인계](../../design/preview-direct-edit/handoff.md), [주소 막대](../../design/manager-address-bar/handoff.md)).
- 개발 서버(`next dev`)가 화면을 처음 컴파일할 때 느려 테스트 제한 시간은 120초입니다. 워커는 2개입니다.
- 프로젝트는 `main → ad-banner → personas` 순서입니다. 전역 광고 배너·광고 블록 플랫폼 스위치 변경은 다른 화면 시나리오와 겹치지 않고, 지표 포함 대조군을 만드는 `personas`는 마지막에 워커 하나로 실행합니다. `ad-banner`는 시작과 끝에 플랫폼 스위치를 기본값(꺼짐)으로 되돌립니다. 특정 프로젝트만 재현하려면 `--project=<이름> --no-deps`를 사용하며 이것은 전체 회귀 통과를 뜻하지 않습니다.

## fixture 원리

### 분석 화면의 선택 호환성 검사

`analytics-responsive.spec.ts`는 크리에이터/관리자 지표·통계 네 화면의 실제 local API와 합성 계정을 사용합니다. 공개 방문에서 수집된 페이지뷰가 나타날 때까지 확인한 뒤 날짜 경계·조회/빈 기간/잘못된 범위 복구·계정 조건 보존·최근7행/이전23행·고정 날짜·내부 스크롤·차트 글자·조작 높이·콘솔 오류를 검사합니다. 폭320/360/390/700/701/768/844·가로 조건과 데스크톱1280/1440을 포함합니다. 페이지별 모바일/데스크톱 첫 화면·전체 PNG 네 장을 결과 폴더에 저장합니다.

일반 E2E의 `main`은 Chromium으로만 실행합니다. `analytics-responsive.config.ts`를 고를 때만 세 엔진으로 반복하므로 관련 없는 전역 시나리오나 모든 QA를 재실행하지 않습니다. 선택 실행의 JSON 결과는 `.local/e2e/analytics-responsive-report.json`에 실행 시간·환경 attachment를 포함해 저장합니다. custom context를 만드는 `data.session()`에 직접 기기 옵션을 전달합니다. Chromium은 Pixel 7, WebKit은 iPhone 13 Pro 프리셋, Firefox는 desktop 엔진의 touch/viewport 조건이며 실제 휴대폰 실행으로 설명하지 않습니다. iOS 조건의 WebKit에서 물리 키보드 가로 이동 대신 내부 scroll과 고정 열을 확인하며 터치 스와이프·native picker·실물 재현은 별도 검수 증거가 필요합니다.

### 공용 데이터·세션

구글 로그인 키 없이 로그인 상태를 만들기 위해 `fixtures.ts`가 개발 DB에 직접 행을 넣습니다(설계 검증 계획의 "테스트 전용 세션 발급").

- 사용자 만들기(`data.user()`): 가입 트랜잭션과 같은 행 `users`(`role` 지정 가능, 운영자는 `operator`) → `user_identities`(provider `google`) → `landings`(10자 `[a-z0-9]` 공개 ID) → `landing_blocks`(`list`, position 0) → `short_links` → `short_slugs`(7자 자동 주소)를 만들고, 필요하면 링크(`links`)와 "방금 주소를 바꾼" 상태(옛 자동 주소 `retired_at=now()` + 새 주소)도 넣습니다.
- 기본 가상 사용자는 `metricsExcluded: true`로 `users.metrics_excluded_at`을 생성 시 설정합니다. `.test` 이메일은 가상 주소/정리 소유권, timestamp는 성장 지표 포함 여부입니다. `data.user({ metricsExcluded: false })`는 localhost 지표 포함 대조군만 만들며 실제 고객이 아닙니다. 기존 AI 운영자 지표 제외 토글 대상만 명시적으로 포함 상태로 시작합니다.
- 세션: 무작위 토큰의 SHA-256 hex를 `sessions.token_hash`에 넣고, 원문 토큰을 브라우저 컨텍스트의 `cl_session` 쿠키(웹 호스트 `127.0.0.1`, httpOnly, SameSite=Lax)로 심습니다(`data.session(user)`, 둘째 인자로 터치 모바일 같은 컨텍스트 설정을 덧붙임). 쿠키는 포트와 무관해 단축 도메인(로컬은 API 주소) 요청에도 함께 갑니다.
- 세션의 User-Agent: `browser.newContext()`는 설정의 `use`를 상속하지 않아 크로미움은 헤드리스 기본값(`HeadlessChrome`)이 됩니다. 이 값은 방문자 지표에서 자동화로 제외되므로(0232) `data.session()`이 크로미움에 `Desktop Chrome` UA를 넣습니다. `options`로 다른 값을 줄 수 있습니다.
- 고유 이름: 실행마다 무작위 꼬리를 붙인 이메일(`…@e2e.crelink.test`), 단축 주소, 링크 도메인(`….e2e.test`), 차단 도메인(`blk-….e2e.test`)을 씁니다. `.test`는 DNS로 풀리지 않아 외부 사이트로 요청이 나가지 않습니다.
- 정리: 테스트가 끝나면 만든 사용자를 지웁니다(나머지 행은 `ON DELETE CASCADE`, 업로드 이미지는 디스크 파일도 지움). 그 사용자가 올린 이미지를 쓰는 크리링 배너(`ad_banners`, 이미지 FK `ON DELETE RESTRICT`)는 사용자보다 먼저 지웁니다. 사용자를 지워도 남는 운영 감사 기록(`operator_actions`·`agent_runs`, `ON DELETE SET NULL`)도 그 사용자가 남긴 것을 먼저 지웁니다. 차단 도메인도 지웁니다. 중단된 실행이 남긴 데이터는 다음 실행이 시작할 때 1시간이 지난 것만 지웁니다. 다만 `ad-banner.spec.ts`는 시작할 때 시험 운영자(`…@e2e.crelink.test`)가 만든 크리링 배너를 시각과 관계없이 지웁니다(남은 게시 배너가 `n / m` 같은 전제를 깨므로). 위 꼬리가 없는 개발 DB의 다른 데이터는 건드리지 않으므로, 개발 DB에 직접 게시한 크리링 배너가 있으면 `ad-banner.spec.ts`가 실패합니다.
- 늦은 beacon과 정리가 겹쳐도 잠금 순서를 뒤집지 않도록, 최종 사용자 삭제는 **해당 정리 대상 사용자의 이벤트 행만** `event_id` 순서로 먼저 `FOR UPDATE`하고 같은 transaction에서 CASCADE 삭제합니다. 실패는 rollback 후 테스트 실패이며 재시도로 숨기지 않습니다.
- AI 운영자 계정(`data.aiAccount()`): 서버 CLI `ensure-account`·`issue-token`처럼 가입과 같은 행(랜딩·단축 주소)을 만든 뒤 `users.kind='ai'`(`role='operator'`)로 바꾸고 Google 신원·세션을 지우며, `api_tokens`(SHA-256 해시) 행을 넣고 토큰 원문을 돌려줍니다. `ai-operator.spec.ts`는 멈춤 스위치와 진행 중 실행이 전역이라 시작할 때 멈춤을 끄고 남은 `running` 실행을 `abandoned`로 닫으며, 끝날 때 멈춤을 끕니다.
- 외부 요청: 컨텍스트마다 `127.0.0.1`(웹·API) 밖 요청에 가짜 응답(`/favicon.ico`는 404, 그 밖은 200)을 줍니다. Playwright route는 리디렉트된 요청을 가로채지 않아 `{SHORT}/c/{id}` 302의 도착지는 DNS 실패로 끝나므로, 테스트는 302 응답의 `Location`과 브라우저가 그 주소로 요청한 것을 확인합니다.
- 콘솔 오류: 모든 페이지의 `console.error`·페이지 예외를 모아 테스트 끝에 비어 있는지 확인합니다. 외부 사이트 아이콘을 못 불러온 리소스 오류(설계상 기본 아이콘으로 대체)와, 시나리오가 일부러 일으킨 API 거부(`data.allowConsoleError`, 예: 차단 도메인 저장 422, 보이는 배너 한도가 찬 상태의 다시 보이기 409)만 뺍니다.
- 방문·클릭 기록은 리디렉트를 기다리지 않고 비동기로 저장되므로 `waitForCount`(광고 배너 노출·클릭은 `expect.poll`)가 DB 행 수를 기다립니다.

시나리오는 서로 데이터를 나누지 않아 순서와 무관하게, 같은 DB에서 반복 실행해도 통과합니다. 예외는 전역인 크리링 배너와 광고 블록 플랫폼 스위치(`platform_settings`)로, 위 `ad-banner` 프로젝트가 따로 돌아 겹치지 않게 합니다. 그래서 `main` 시나리오의 관리 화면에는 광고 블록 줄이 없습니다(플랫폼 꺼짐).

## 시나리오

| 파일 | 검증 계획 | 확인 내용 |
| --- | --- | --- |
| `creator.spec.ts` | 1 크리에이터 | `/me`는 307로 관리 화면 `/me/landings/{publicId}`(`페이지 편집`)로 이동, 머리글은 `계정 메뉴`(열면 이메일·`로그아웃`, 크리에이터에게 `운영자 화면` 없음, Esc로 닫으면 초점 복귀, `공개 페이지 열기` 없음), `내 페이지` 머리 카드 없음 → 무대 주소 막대: 도메인 글자(`http(s)://` 없이) + 저장된 주소가 채워진 입력란·`내 크리링 링크 복사` 아이콘·`공개 페이지 열기 (새 창)`, 처음 패널 구역 목록(외부 링크 `링크 0/50`·포트폴리오 `0/20`·방명록 `켜짐`) → 미리보기 `프로필 편집`을 고르면 패널 `프로필` 안내(제목 초점, '이름 없음') → `프로필에서 고치기`로 `프로필` 메뉴(강조 미리보기, 고르기 버튼 없음): 프로필 사진(1×1 PNG)·이름·소개, SNS를 저장 전에 미리보기에 바로 보이고 카드 '저장 안 함'·무대 '저장하지 않은 변경 포함', 저장하면 표시 사라짐 → `페이지 편집` 미리보기의 SNS는 링크가 아닌 `SNS 채널 편집` 버튼(패널에 저장한 이름), `전체`로 돌아오면 그 버튼에 초점 → 구역 목록 `포트폴리오` → `포트폴리오 추가` 폼(입력 자동 초점 없음, 제목 초점)으로 저장 전 미리보기 반영·'저장 안 함', 저장 결과 안내 → 미리보기 포트폴리오 카드로 항목 폼, `취소` → 주소 막대 복사(클립보드, 결과 문장은 막대 아래) → 입력하면 복사·열기 대신 `취소`·`변경`, 막대의 Esc·`취소`는 저장값으로 되돌리고 초점 유지 → 자동 주소에서 Enter 두 번은 저장되지 않음(대화상자 첫 초점 `취소`) → `변경` → 확인 대화상자 → `이 주소로 바꾸기`로 저장(입력란 대신 주소 글자, 초점 `새 주소 복사`, 막대 복사도 바뀐 주소), 메뉴를 옮기면 성공 안내 닫힘 → 30일 제한은 입력란 없이 주소 글자와 다음 변경 가능일, API도 429 `slug_change_too_soon` → 옛 `/settings` 주소는 `페이지 편집`으로, 390px 확인 → 미리보기 `외부 링크 구역 편집`으로 외부 링크 패널 → 미리보기 `+ 링크 추가`는 대화상자 없이 패널이 `새 링크` 폼: 저장 전 초안이 미리보기 끝에 붙고 Esc로 취소하면 사라지며 패널 제목으로 초점 → 보이는 링크 6개 추가(`링크 6/50`) → 숨기기 스위치(흐리게·숨김 배지, 미리보기에서 빠짐, 배지 그대로)·다시 보이기는 한도 없음 → 숨긴 링크를 API로 채워 숨김 포함 50개면 패널·미리보기에 추가 버튼 대신 한도 안내, 51번째는 숨김 여부와 관계없이 API도 409 `link_total_limit_reached` → 채운 링크 삭제 → 행 `수정`은 패널을 링크 폼으로 바꿈(`접기` 없음): 이름·설명·썸네일 수정이 저장 전 미리보기 제자리에 반영 → 저장하지 않고 미리보기에서 다른 링크 카드를 고르면 그 폼(제목 초점), 초안은 남음 → `전체`로 나가면 처음 고른 미리보기 버튼으로 초점, 구역 목록·외부 링크 행에 '저장 안 함' → 초안 이름으로 다시 골라 남은 초안 저장, 외부 링크 패널로 돌아와 결과 안내 → 손잡이 마우스 드래그와 키보드(스페이스·↑·스페이스, 한국어 스크린리더 안내, 광고 블록 플랫폼 스위치가 꺼져 광고 행 없음)로 순서 변경(새로고침 뒤 유지) → 링크 폼에서 삭제(확인 창) → `페이지 편집` 미리보기에는 원래 링크(`<a>`)가 없고 링크 카드를 눌러도 이동·새 창 없이 패널만 바뀜, `방명록` 메뉴의 방문자 모습 미리보기(링크 탭)의 링크는 저장된 URL이고 눌러도 이동·새 창 없음 → 옛 보기 모드 주소(`?mode=view`)는 `페이지 편집`으로 → 1280px·390px 가로 넘침 없음 → 390px: 무대 대신 sticky 줄(단축 주소·복사·공개 페이지 열기), 자물쇠 → 다음 변경 가능일 시트(입력 비활성, 닫으면 초점 복귀), 떠 있는 `미리보기` 버튼·대화상자 없음, `편집`은 고르기 버튼이 있는 전체 폭 미리보기·`미리보기`는 방문자 모습(`aria-pressed`) → `+ 링크 추가` 하단 시트(첫 입력 초점, `저장`·`취소`): 입력하면 미리보기에 초안, `취소`는 초안을 버리고 외부 링크 시트로, Esc·배경 누르기·`닫기`로 닫힘과 초점 복귀, 열린 시트는 화면 아래에 붙고 넘침 없음 → 링크 카드를 골라 시트로 설명 수정·저장하면 시트가 외부 링크 목록과 결과 안내로 바뀌고 닫으면 고른 카드로 초점 → 390px `프로필` 메뉴의 편집 화면은 프로필 폼 → 남의 랜딩 ID는 찾을 수 없음(`내 크리링으로` 링크), 로그인하지 않으면 관리 화면·`/me`는 `/` → 공개 랜딩에 프로필·SNS·포트폴리오·미리보기와 같은 링크 목록, 390px 확인. 별도 시나리오로 390px 터치 모바일 컨텍스트에서 연필 → 주소 변경 시트(Enter 두 번·두 번 탭으로 저장되지 않음, 확인 단계 → 저장, 닫으면 자물쇠가 된 같은 버튼으로 초점), `외부 링크 구역 편집`으로 연 외부 링크 시트의 손잡이를 CDP 터치 이벤트로 끌어 순서 변경(새로고침 뒤 미리보기·시트에 유지) |
| `visitor.spec.ts` | 2 방문자 | 새 단축 주소(Referer 인스타그램)·옛 주소 모두 `WEB_URL/p/{publicId}` 같은 랜딩(통과 표시 `?pass=`는 주소창에서 지워짐), 숨긴 링크 없음 → 링크 클릭이 `{SHORT}/c/{id}`에서 저장된 URL로 302, 숨긴 링크 클릭 주소는 `link_unavailable` 안내 → `visits`(유입 호스트·기기·브라우저·OS·IP·visitor_id)·`link_clicks` 행, 같은 브라우저 재방문은 같은 `visitor_id`(= `cl_vid` 쿠키), 다른 브라우저는 다른 값. 별도 시나리오로 외부 진입(PRD R7): 관리 화면 무대 주소 막대의 `공개 페이지 열기`(같은 출처, 새 창)는 단축 주소 없이 열리고 방문으로 안 셈 → 랜딩 주소를 바로 열면(Referer 카카오) `/p/{id}` → 단축 주소 → `/p/{id}?pass=…` 리디렉트 사슬, 주소창은 `/p/{id}`, 방문 1건(유입 호스트 유지) → 같은 주소를 다시 열면 또 단축 주소를 거침 |
| `operator.spec.ts` | 3 운영자 | 방문 3·순 방문자 2·클릭 1을 만든 뒤 `/admin` 검색 → 목록의 최근 30일 방문 → 상세 통계 합계가 DB와 일치, 분포 표(유입 경로·기기·브라우저·운영체제)·링크별 클릭, 390px 확인 → 크리에이터 상세에 추가 슬롯 폼 없음, 보이는 링크 5개 크리에이터가 슬롯 부여 없이 `링크 추가` 폼으로 6번째 링크 추가(`링크 6/50`, 미리보기에 반영) → 운영자 관리 화면 머리글의 `운영자 화면` 링크 → 도메인 차단 후 랜딩에서 링크 사라짐·클릭 주소 안내·외부 링크 패널에 차단 표시와 사유(숨기기 스위치 잠김), 미리보기에서도 빠짐 → 하위 도메인 링크 저장 거부 안내(링크 폼 안), `취소`로 외부 링크 패널 → 크리에이터의 `/admin`·상세 접근은 권한 없음 |
| `notices.spec.ts` | 4 안내 화면 | 빈 랜딩은 준비 중 문구와 크리링 표시로 열림(390px) → 없는 단축 주소는 `/notice?reason=link_not_found` → 운영자가 정지하면 단축 URL은 `/notice?reason=creator_suspended`, `/p/{id}`도 정지 안내, 링크 클릭 주소는 `link_unavailable`, 크리에이터 세션은 끊겨 `/me`와 관리 화면이 홈으로 |
| `guestbook.spec.ts` | 방명록 1~8 | 크리에이터·작성자·다른 회원·비회원 컨텍스트로 `/p/{id}#guestbook`(단축 주소를 거쳐도 해시와 방명록 탭 유지) → 비회원 빈 상태·`로그인하고 남기기`(`returnTo`) → 작성자의 공개글·비밀글 → 비회원·다른 회원은 공개글만(BFF 응답 원문에도 비밀글 없음, 버튼 없음) → 크리에이터가 관리 화면 `방명록` 메뉴(비밀글 표시, 삭제·작성 폼 없음)에서 숨김: 무대 미리보기 방명록 탭(방문자 시점, 비밀글·숨긴 글·버튼 없음, 누를 수 없는 로그인 안내)과 비회원·다른 회원에게서 사라지고 작성자에게는 숨김 표시 없이 그대로, 숨김 해제 → 작성자 삭제 → `방명록` 메뉴 스위치로 끄면 꺼짐 안내, 미리보기·공개 랜딩에 탭 없음, API 404 `guestbook_disabled` → `페이지 편집` 구역 목록 `방명록 꺼짐`으로 연 방명록 패널(제목 초점)의 같은 스위치로 켜면 미리보기가 방명록 탭, `전체`로 돌아오면 구역 목록 `켜짐`·미리보기 링크 탭 → 미리보기 `방명록 탭 편집`으로 다시 패널, `방명록 글 관리`로 남은 글(관리 화면 390px 확인) → 이름 없는 작성자 '크리링 회원', 긴 글 390px |
| `ad-banner.spec.ts` | 광고 배너 1~9, 광고 블록 스위치 (b)~(e) | **무료 랜딩**: 운영자 배너 2장 → **플랫폼 스위치 꺼짐(기본)**: 공개 랜딩에 광고 없음, 편집 화면에 광고 칩·광고 행·`광고 블록 표시` 스위치 없음, `PUT /api/me/ad-block`은 409 `ad_block_unavailable` → 운영자가 `/admin/ad-banners`의 `광고 블록 사용` 스위치를 켬(행동 기록 `platform.ad_block` 전후 값) → **크리에이터 꺼짐(기본)**: 공개 랜딩 광고·노출 없음, 편집 화면 광고 행과 꺼진 스위치, 미리보기 광고 없음 → 크리에이터가 켜면 미리보기 광고 칩 → 단축 주소로 연 랜딩 맨 뒤에 `크리링 광고` 영역·`광고` 배지·`1 / 2`, 5초 뒤에도 그대로, `다음 배너`로 `2 / 2`(끝 비활성), ←로 첫 장(초점은 새 장 링크) → 노출 1(첫 장, 랜딩별) → `/a/{배너}/{랜딩}` 302(no-store, 쿠키 없음)·클릭 기록, 없는 `/a/`·`/b/`는 `link_unavailable` → 운영자 화면에서 연 랜딩(같은 출처)은 광고 주소가 저장된 URL → 외부 링크 패널의 광고 행(`광고 블록 표시` 스위치, 삭제 없음, `링크 3/50`)을 키보드로 맨 앞·2번째 링크 다음으로, 링크를 슬롯 너머로 옮기면 미리보기·공개 랜딩 순서가 같음, `광고 블록` 패널의 `외부 링크 목록에서 끌어 옮기기`는 광고 행 손잡이로 초점, 관리 미리보기·운영자 화면에서 연 랜딩은 노출이 늘지 않음 → 운영자 표 노출·클릭이 DB 누적과 같음 → 모두 내리면 광고 없음·미리보기 점선 안내 → 다시 게시 뒤 링크를 모두 숨기면 없음, 포트폴리오를 더하면 광고 블록만. **운영자 크리링 배너**: 메뉴 `광고 배너` → 게시 0장 경고 → `배너 등록` 대화상자 오류(ftp 주소·차단 도메인·끝이 시작보다 앞) 뒤 저장 → GIF는 정지 이미지 쌍으로 저장(DB `animated`) → 미래 시작은 `예약`에만 → `전체`에서 키보드 정렬이 공개 랜딩 순서 → `수정` 대화상자는 바뀐 필드(연결 URL)만 PATCH → `움직임 멈추기`로 정지 이미지, `prefers-reduced-motion: reduce`는 처음부터 정지 이미지·버튼 숨김 → 차단 도메인을 더하면 게시 배너가 끝남, 기간만 고쳐 다시 열면 422 → `내리기`(확인)로 끝남·랜딩에서 빠짐·게시 0장 경고, 390·700·1280px. **배너 슬롯**: 운영자 부여(확인) → 보이는 배너 0장이라 숨음(미리보기 점선) → `배너 추가` 필수 항목·차단 도메인 거부 → 같은 자리에 배지 없는 `<이름> 배너`, `/b/` 클릭 기록(visitor_id·IP) → 5장이면 추가 막힘, 숨긴 배너 다시 보이기 409 안내·스위치 되돌림, 숨긴 배너 주소는 안내 → 패널 키보드 정렬이 공개 랜딩 첫 장 → 운영자 배너 차단: 패널 `차단됨`·사유·잠긴 스위치, 주소를 바꿔도 차단 유지 → `배너별 클릭` 표 → 회수: 같은 자리 광고 블록, 보관 6장 → 재부여: 이전 배너 그대로, 플랫폼·크리에이터 스위치를 꺼도 배너 슬롯 그대로 → 차단 도메인 추가로 배너 차단 → 배너 폼 `삭제`(확인) → 배너 폼을 연 채 회수되면 저장 시 회수 안내·처음 패널·초안 버림 → 운영자 `차단 풀기`, 크리에이터 상세 390·1280px. **방명록·반응형**: 광고는 `링크` 탭에만, 공개 랜딩 320·390·1280px, 페이지 편집 390·1280px, 390px의 `광고 블록` 칩 → 하단 시트 → `외부 링크 목록에서 끌어 옮기기`가 광고 행 손잡이로 초점. 파일 시작·끝에 플랫폼 스위치를 꺼짐으로 되돌림 |
| `ai-operator.spec.ts` | AI 운영자 1~4 | 실행 호스트 도구 `scripts/ai-operator.mjs`(시험 전용 환경변수·상태 폴더)를 실제로 실행해 웹 토큰 경로 `/api/agent` → API를 지남: 토큰 없음 401·토큰 200·`precheck` 0 → `start`로 실행 기록 열기, 두 번째 `start` 409 `agent_run_in_progress`·`precheck` 1 → 실행 헤더 없는 AI 쓰기 409 `agent_run_required`, `api`로 배너 슬롯 부여(행동 기록 `ai`·실행 id·전후 값 DB 확인), AI가 사람 운영자 정지·멈춤 바꾸기는 403 → `context` 지표·이번 실행 → `finish`(요약·한 일·다음 할 일·PR 링크) → 사람 운영자 390px `/admin/agent-runs` 카드(성공·다음 할 일·PR 링크)·상세의 `이 실행의 운영 기록`·`/admin/actions?actor=ai` 행, 가로 넘침 없음 → 크리에이터 상세 `지표에서 빼기`(배지·사람 행위자 기록), AI 계정 상세는 안내만 → 화면에서 멈춤 켜기 → `precheck`·`start` 1, 같은 멈춤의 기록 한 행(`paused_count` 2), AI 쓰기 409 `ai_operator_paused` → 멈춤 풀기 → `precheck` 0 → 화면에서 토큰 폐기 → 401·`precheck` 1 |
| `personas.spec.ts` | SIM-01~05 | 첫 링크 UI 저장 실패(503)→입력/DB 보존→실제 저장 재시도→새로고침→모바일 공개 방문/브라우저 클릭→본인 수집 페이지뷰/클릭 통계, 시험 계정 성장 지표 불변, localhost 포함 대조군의 숨김/공개/제외/재포함, 타 계정 통계 격리/운영 통계 거부·익명/위험 URL 쓰기 거부·기존 데이터 보존, 세션 만료 뒤 재시도 거부. SIM-05는 등록 지연 중 실제 다른 origin 루프백 문서로 즉시 이동해 pageview/click 각1행·바인딩·중복 멱등·서명 거부를 검사한다([0205 근거](../../apps/web/docs/visitor-telemetry.md#0205-실제-실행-근거2026-11-07)). |
| `instabio-import.spec.ts` | 0197·0200 | 외부 원본만 고정 fixture로 제공하고 실제 내부 API/PostgreSQL로 미리보기 무변경→중복 제외 추가 저장→기존 프로필/링크/카드 설정 보존→새로고침/공개 표시·접근성 검사 |

실제 구글 로그인(키 발급 후)과 인스타그램 인앱 브라우저 확인은 이 테스트 범위 밖이며 설계의 [위험과 스파이크](../../docs/specs/crelink-mvp.md#위험과-스파이크)대로 수동으로 확인합니다.

## 링크 표시 방식만 검사

`pnpm e2e --config tests/e2e/link-layout.config.ts`는 합성 계정으로 Chromium·모바일 조건의 WebKit·Firefox에서 리스트/카드 선택 저장·실패 복구/재시도·새로고침·공개/미리보기 일치·320/390/768/1280의 **카드2열**·844×390 가로 조건·320px 글자200% 확대·배너 전체 열/사진/긴 제목/이미지 없음·키보드·axe WCAG A/AA를 확인합니다. 글자 확대는 브라우저 페이지 배율이나 OS 확대를 대신하지 않습니다. 실제 iPhone 실행을 뜻하지 않습니다. [0200](../../docs/work/orchestrator/0200-release-qa.md).

`list-density.spec.ts`도 같은 config에 포함됩니다(0204). 기본8과8/10/12 UI 저장→실제 PostgreSQL→creator/public·새 세션·새로고침, list/grid 왕복, 비기본10 실패 복구·수동 재시도·동일 이벤트 루프 중복/교차 잠금·pending 중 패널/시트 전환·실제401 홈 이동을 검사합니다. Instabio 외부 preload가 필요한 가져오기 초안/저장 보존도3엔진에 포함하므로 아래 API 전용 fixture 준비를 먼저 적용합니다. 503 및 잘못된 응답만 브라우저 route로 주입하며 그 뒤 실제 API 저장을 다시 확인합니다.

390px에서 동일 한줄 제목·동일 사진14개를 실제 업로드하고 공개/미리보기의 목록 시작부터740px 내 완전 노출8/10/12·카드 높이·간격·동일 제목 글꼴·contain을 측정합니다. 폭320/390/768/1280의 긴 제목/설명·기본 아이콘·배너 전체 폭·44px 카드와320px 글자200%를 추가 검사합니다. 실행 PNG는 생성 시안/시각 baseline이 아니며 Linux grid 기준선은 그대로 유지합니다.

오프라인 사진 fixture `fixtures/list-density-landscape.jpg`는 [Unsplash 원본](https://images.unsplash.com/photo-1500534623283-312aade485b7?w=240&h=160&fit=crop)의240×160 JPEG입니다([Unsplash 라이선스](https://unsplash.com/license)). 사진 내용·화소를 기준선으로 고정하지 않고 모든 행에서 같은 비정사각형 사진의contain·높이/밀도를 검사합니다. 테스트 중 외부 사진 다운로드는 하지 않습니다.

## 출시 QA·CI 실행 계약

기존 runner/fixture·3엔진 config를 재사용합니다. 같은 DB에서 아래 명령을 **순차** 실행합니다. `core`는 전역 AI 실행/운영 토큰 시험을 포함하지 않습니다. CI는 reporter CLI 옵션과 `PLAYWRIGHT_HTML_OUTPUT_DIR`·`PLAYWRIGHT_JSON_OUTPUT_NAME`·`--output`을 suite별로 지정하고 종료 코드가 0이 아니면 실패입니다.

실행별 정상/실패·수정·미검증 근거는 [0200 출시 QA 보고](../../docs/reviews/0200-release-qa.md)에 남깁니다. `release-qa.spec.ts`를 별도로 만들지 않고 기존 personas/layout 시나리오를 확장합니다.

```sh
PLAYWRIGHT_HTML_OPEN=never PLAYWRIGHT_HTML_OUTPUT_DIR="$PWD/.local/ci/e2e/core/html" PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.local/ci/e2e/core/report.json" pnpm e2e '(^|/)(creator|visitor|operator|notices|guestbook|instabio-import)\.spec\.ts$' --project=main --no-deps --reporter=list,html,json --output=.local/ci/e2e/core/results
PLAYWRIGHT_HTML_OPEN=never PLAYWRIGHT_HTML_OUTPUT_DIR="$PWD/.local/ci/e2e/personas/html" PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.local/ci/e2e/personas/report.json" pnpm e2e personas --project=personas --no-deps --reporter=list,html,json --output=.local/ci/e2e/personas/results
PLAYWRIGHT_HTML_OPEN=never PLAYWRIGHT_HTML_OUTPUT_DIR="$PWD/.local/ci/e2e/analytics/html" PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.local/ci/e2e/analytics/report.json" pnpm e2e --config tests/e2e/analytics-responsive.config.ts --reporter=list,html,json --output=.local/ci/e2e/analytics/results
PLAYWRIGHT_HTML_OPEN=never PLAYWRIGHT_HTML_OUTPUT_DIR="$PWD/.local/ci/e2e/layout/html" PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/.local/ci/e2e/layout/report.json" pnpm e2e --config tests/e2e/link-layout.config.ts --reporter=list,html,json --output=.local/ci/e2e/layout/results
```

각 `results/`에 PNG·실패 trace가 남고 HTML/JSON은 위 경로에 남습니다. CI의 artifact 업로드는 성공/실패와 무관하게 이 트리를 보관해야 합니다. 직접 Playwright 실행도 fixture의 loopback 검사와 정리를 우회하지 못합니다.

명령은 저장소 루트에서 실행합니다. JSON reporter의 상대 경로 기준은 config 디렉터리이므로 절대 경로를 넘깁니다. CI에서는 `$PWD` 대신 `$GITHUB_WORKSPACE`도 사용할 수 있습니다.

### Instabio 외부 fixture 준비

API **프로세스에만** `CRELINK_E2E_INSTABIO=1 NODE_OPTIONS="--import <checkout 절대 경로>/tests/e2e/instabio-source.mjs"`와 네 로컬 대상 환경변수를 전달하고 시작합니다. 일반 서버·운영 실행 설정에는 넣지 않습니다. preload는 기존 `assertLocalE2ETargets`를 먼저 실행하고 `https://instabio.cc/CrelinkE2E0200` 및 그 ID의 고정 CDN JSON 두 URL만 대체합니다. 그 밖의 요청은 원래 fetch로 전달합니다. 내부 웹/BFF/API/인증/DB는 실제 경로이며, 외부 live Instabio 가용성·구조 변경·실제 이미지 다운로드 검증으로 보고하지 않습니다.

### 시각 기준선과 접근성

`link-layout.spec.ts`의 안정된 공개2열 grid 영역(390×844, 고정 합성 제목/배너, 이미지·기본 아이콘, fonts.ready, animation disabled)을 Linux Chromium에서 `toHaveScreenshot('public-two-column.png')`로 비교합니다. OS별 렌더링을 섞지 않기 위해 Ubuntu24.04·lockfile Playwright1.64.0 Linux Chromium을 생성/검증 환경으로 맞춥니다. macOS 실행에서는 수치·동작·axe만 검증하고 screenshot 비교는 **not-run**입니다. 3엔진 실행은 유지하며 WebKit/Firefox를 Chromium 시각 baseline과 비교하지 않습니다.

기준선이 없으면 CI는 missing-baseline으로 **실패**해야 합니다. PM이 실패 artifact의 actual PNG를 직접 열어2열·잘림·간격·배너·가독성을 검토하고 승인한 PNG만 `tests/e2e/link-layout.spec.ts-snapshots/public-two-column-chromium-linux.png`에 추가한 뒤, 같은 환경에서 일반 명령으로 비교 성공을 확인합니다. 실패 이미지를 자동승인하거나 허용 픽셀을 임의로 늘리지 않습니다(`maxDiffPixels: 0`). Playwright/OS/폰트 변경은 기준선 재검토 대상입니다.

접근성은 [Playwright 공식 지침](https://playwright.dev/docs/accessibility-testing)의 `@axe-core/playwright`4.14.0으로 공개 grid 전체 페이지와 열린 Instabio 패널에 WCAG2/2.1 A/AA를 검사합니다. 전체 scan JSON을 attachment로 보존하며 위반을 일괄 제외하지 않습니다. 자동검사는 스크린리더·실물 터치·키보드 수동 평가 전체를 보증하지 않습니다.


## 0280 모든 댓글 local fixture (Coordinator)

[0280 티켓](../../docs/work/orchestrator/0280-instagram-all-comments.md)의 브라우저 검증 전용입니다. 기존 `ego/lib/harness.mjs`의 `loadTargets` 루프백 검사, `ego/lib/data.mjs`의 합성 사용자/세션과 API의 `test-app.ts`·`test-database.ts`를 재사용합니다. Graph 게시물 목록만 고정하고 발송 worker·토큰 점검·보존 타이머는 끕니다. 나머지 Graph 메서드와 외부 fetch는 거부합니다. 실제 Nest API·일회용 PostgreSQL·웹 BFF·RuleEditor를 사용하므로 checkbox 생성/편집/저장/재진입이 실제 DB까지 이어집니다. 개발 DB의 플랫폼 설정과 기존 서버는 바꾸지 않습니다.

```sh
make infra-up
pnpm --filter @crelink/shared build
node tests/e2e/ego/instagram-all-comments.fixture.mjs --check # TS/provider 로더만 확인, 서버/DB 검사 아님
node tests/e2e/ego/instagram-all-comments.fixture.mjs > /tmp/crelink-0280-fixture.log 2>&1
```

마지막 명령은 계속 실행됩니다. 이 실행은 루프백 임의 포트의 API/웹을 직접 띄우고, `.next/0280-ui`를 써 기존 Next dev 캐시/잠금과 분리합니다. 준비되면 `/tmp/crelink-0280-ui/config.json`에 `webUrl`, `apiUrl`, `settingsUrl`, `deliveriesUrl`, 합성 `sessionToken`을 기록합니다(0600). 로컬 세션이므로 기록을 외부에 올리지 않습니다. Coordinator는 ego TaskSpace를 열고 기존 `ego/lib/browser.mjs`의 `setSessionCookie(page, config, config.sessionToken)`로 쿠키를 설정한 뒤 `settingsUrl`로 이동합니다. 외부 리소스 차단·콘솔 수집·viewport·쿠키 정리는 같은 `browser.mjs` 도구를 사용합니다. 브라우저 실행은 fixture에 포함하지 않습니다.

확인 순서(390px와 1280px에서 반복):

1. `규칙 추가` → `post-a` 선택 → 체크박스 기본 꺼짐, 키워드 필수 확인 → 키워드 `링크`·메시지 입력 → 모든 댓글 켜기(키워드 disabled)·끄기(값 복귀)·다시 켜기 → 저장.
2. 목록의 `모든 댓글` 표시 → 고치기 → checked/disabled·키워드 `링크` 보존 확인 → 메시지 변경 저장 → 다른 관리 메뉴로 이동·복귀 또는 새로고침 → 같은 모드·문구 확인.
3. 체크박스를 끄고 저장 → 목록 키워드와 재진입의 unchecked 상태 확인. `post-b`는 키워드 빈 채 모든 댓글 모드로 생성 → 저장/재진입 → 끄면 키워드 필수 오류 확인 → 키워드 입력 후 저장. 공개 답글 선택 입력도 보존되는지 확인.
4. `발송 내역`의 규칙 필터가 모든 댓글을 표시하는지 확인(실제 발송하지 않아 내역은 비어 있음). `privacy`의 마커 보관/삭제 안내, 두 폭 가로 넘침·초점·콘솔 오류를 확인.
5. `/tmp/crelink-0280-ui`에 폭별 생성·편집·저장·복귀 PNG, 콘솔 결과와 `git rev-parse HEAD`/`git diff --stat`을 남깁니다. fixture의 `apiRulesUrl`에 합성 세션 Cookie로 GET하면 실제 저장된 `matchAllComments`·keyword 응답을 확인할 수 있습니다. 최종 DB 통합 근거는 아래 API 시험도 별도로 통과해야 합니다.

브라우저의 합성 세션 쿠키만 지우고 TaskSpace를 정리한 다음 fixture 터미널에 Ctrl-C 또는 `/tmp/crelink-0280-ui/pid`의 PID에 SIGTERM을 보냅니다. 이 실행의 API/웹·합성 행·일회용 DB·업로드만 정리하고 `config.json`·pid를 지웁니다. PNG/콘솔 결과와 `.next/0280-ui` 캐시는 남깁니다. 기존 서버·Compose·볼륨은 건드리지 않습니다. 강제 종료(SIGKILL)는 정리 경로를 건너뛰므로 사용하지 않습니다.

DB 시험은 기존 격리 경로에서 다음을 실행합니다. mock Graph와 실제 HTTP/PostgreSQL로 저장·원자성·동시성·백필·삭제를 검증하며 실제 Meta 식별자/발송을 검증하지 않습니다.

```sh
pnpm --filter @crelink/api test --runInBand --runTestsByPath test/instagram-webhook.e2e-spec.ts test/instagram-rules.e2e-spec.ts test/instagram-deliveries.e2e-spec.ts test/instagram-admin.e2e-spec.ts test/health.e2e-spec.ts test/instagram-all-comments-migration.e2e-spec.ts
```
