# 크리링 MVP E2E

실행 중인 웹·API·PostgreSQL에 [크리링 MVP 기술 설계의 검증 계획](../../docs/specs/crelink-mvp.md#검증-계획) E2E 1~4와 [방명록 기술 설계의 검증 계획](../../docs/specs/crelink-guestbook.md#검증-계획)을 Playwright로 실행합니다. 화면과 무관한 불변 조건(헬스 체크, 첫 화면 렌더링)은 `pnpm smoke`(`tests/smoke/`)가 맡고, 이 폴더는 화면 시나리오와 웹→API→DB 연결을 확인합니다.

## 실행

```sh
make up                                   # 인프라·API·웹 실행(이미 떠 있으면 생략)
pnpm exec playwright install chromium     # 처음 한 번
pnpm e2e                                  # 전체 시나리오
pnpm e2e operator                         # 파일 이름 일부로 골라 실행(나머지 인자는 playwright test에 그대로 전달)
```

- `scripts/e2e.mjs`가 `WEB_URL`·`API_URL`·`SHORT_LINK_BASE_URL`·`DATABASE_URL`을 환경변수, 없으면 이 checkout의 인스턴스 설정 `.local/instance.env`(`pnpm instance`)에서 읽어 넘깁니다. 실행 전에 API(`/api/health/ready`)·웹·DB 연결과 Chromium 실행을 확인하고, 실패하면 해결 방법을 출력합니다.
- 다른 인스턴스를 검사하려면 네 값을 모두 환경변수로 넘깁니다. API가 `UPLOAD_DIR`을 바꿔 쓰면 같은 값을 `UPLOAD_DIR`로 넘겨야 업로드 파일 정리가 맞습니다(상대 경로는 `apps/api` 기준).
- 결과·trace는 `.local/e2e/test-results/`에 남습니다(실패 시 `pnpm exec playwright show-trace <trace.zip>`).
- 데스크톱 1280px가 기본이고, `/me`·`/me/landings/{publicId}`(편집·보기 모드, 열린 하단 시트)·`/p/{publicId}`·`/admin/creators/{id}`는 390px로 다시 열어 가로 넘침이 없는지도 봅니다.
- 개발 서버(`next dev`)가 화면을 처음 컴파일할 때 느려 테스트 제한 시간은 120초입니다. 워커는 2개입니다.

## fixture 원리

구글 로그인 키 없이 로그인 상태를 만들기 위해 `fixtures.ts`가 개발 DB에 직접 행을 넣습니다(설계 검증 계획의 "테스트 전용 세션 발급").

- 사용자 만들기(`data.user()`): 가입 트랜잭션과 같은 행 `users`(`role` 지정 가능, 운영자는 `operator`) → `user_identities`(provider `google`) → `landings`(10자 `[a-z0-9]` 공개 ID) → `landing_blocks`(`list`, position 0) → `short_links` → `short_slugs`(7자 자동 주소)를 만들고, 필요하면 링크(`links`)와 "방금 주소를 바꾼" 상태(옛 자동 주소 `retired_at=now()` + 새 주소)도 넣습니다.
- 세션: 무작위 토큰의 SHA-256 hex를 `sessions.token_hash`에 넣고, 원문 토큰을 브라우저 컨텍스트의 `cl_session` 쿠키(웹 호스트 `127.0.0.1`, httpOnly, SameSite=Lax)로 심습니다(`data.session(user)`, 둘째 인자로 터치 모바일 같은 컨텍스트 설정을 덧붙임). 쿠키는 포트와 무관해 단축 도메인(로컬은 API 주소) 요청에도 함께 갑니다.
- 고유 이름: 실행마다 무작위 꼬리를 붙인 이메일(`…@e2e.crelink.test`), 단축 주소, 링크 도메인(`….e2e.test`), 차단 도메인(`blk-….e2e.test`)을 씁니다. `.test`는 DNS로 풀리지 않아 외부 사이트로 요청이 나가지 않습니다.
- 정리: 테스트가 끝나면 만든 사용자를 지웁니다(나머지 행은 `ON DELETE CASCADE`, 업로드 이미지는 디스크 파일도 지움). 차단 도메인도 지웁니다. 중단된 실행이 남긴 데이터는 다음 실행이 시작할 때 1시간이 지난 것만 지웁니다. 위 꼬리가 없는 개발 DB의 다른 데이터는 건드리지 않습니다.
- 외부 요청: 컨텍스트마다 `127.0.0.1`(웹·API) 밖 요청에 가짜 응답(`/favicon.ico`는 404, 그 밖은 200)을 줍니다. Playwright route는 리디렉트된 요청을 가로채지 않아 `{SHORT}/c/{id}` 302의 도착지는 DNS 실패로 끝나므로, 테스트는 302 응답의 `Location`과 브라우저가 그 주소로 요청한 것을 확인합니다.
- 콘솔 오류: 모든 페이지의 `console.error`·페이지 예외를 모아 테스트 끝에 비어 있는지 확인합니다. 외부 사이트 아이콘을 못 불러온 리소스 오류(설계상 기본 아이콘으로 대체)와, 시나리오가 일부러 일으킨 API 거부(`data.allowConsoleError`, 예: 차단 도메인 저장 422, 한도가 찬 상태의 다시 보이기 409)만 뺍니다.
- 방문·클릭 기록은 리디렉트를 기다리지 않고 비동기로 저장되므로 `waitForCount`가 DB 행 수를 기다립니다.

시나리오는 서로 데이터를 나누지 않아 순서와 무관하게, 같은 DB에서 반복 실행해도 통과합니다.

## 시나리오

| 파일 | 검증 계획 | 확인 내용 |
| --- | --- | --- |
| `creator.spec.ts` | 1 크리에이터 | `/me` 단축 URL 표시·복사(클립보드) → 프로필 사진(1×1 PNG)·이름·소개 저장 → SNS·포트폴리오 추가 → 자동 주소에서 바로 주소 변경 → 30일 제한 안내·입력 잠금, API도 429 `slug_change_too_soon` → `/me`에는 링크 폼 대신 '링크 관리' 요약·머리글 링크 → 관리 화면 `/me/landings/{publicId}` 편집 모드(랜딩과 같은 배치) → 하단 시트 Esc·배경 누르기로 닫힘과 포커스 복귀 → 시트로 링크 5개 추가 후 한도 안내와 추가 버튼 없음, API도 409 `link_limit_reached` → 숨기기 스위치(흐리게·숨김 배지) 후 6번째 추가 → 한도가 찬 상태에서 다시 보이기는 409로 스위치가 되돌아가고 안내 → 시트로 이름·설명·썸네일 수정 → 손잡이 마우스 드래그와 키보드(스페이스·↑·스페이스, 한국어 스크린리더 안내)로 순서 변경(새로고침 뒤 유지) → 시트에서 삭제(확인 창) → 1280px·390px 편집 모드와 열린 시트(화면 아래에 붙음) 가로 넘침 없음 → 보기 모드(`?mode=view`)에 숨긴 링크 없이 바꾼 순서, 링크는 저장된 URL → 남의 랜딩 ID는 찾을 수 없음, 로그아웃 상태는 `/` → 공개 랜딩에 프로필·SNS·포트폴리오·보기 모드와 같은 링크 목록, 390px 확인. 별도 시나리오로 390px 터치 모바일 컨텍스트에서 CDP 터치 이벤트로 손잡이를 끌어 순서 변경(새로고침 뒤 유지) |
| `visitor.spec.ts` | 2 방문자 | 새 단축 주소(Referer 인스타그램)·옛 주소 모두 `WEB_URL/p/{publicId}` 같은 랜딩(통과 표시 `?pass=`는 주소창에서 지워짐), 숨긴 링크 없음 → 링크 클릭이 `{SHORT}/c/{id}`에서 저장된 URL로 302, 숨긴 링크 클릭 주소는 `link_unavailable` 안내 → `visits`(유입 호스트·기기·브라우저·OS·IP·visitor_id)·`link_clicks` 행, 같은 브라우저 재방문은 같은 `visitor_id`(= `cl_vid` 쿠키), 다른 브라우저는 다른 값. 별도 시나리오로 외부 진입(PRD R7): `/me` 미리보기(같은 출처)는 단축 주소 없이 열리고 방문으로 안 셈 → 랜딩 주소를 바로 열면(Referer 카카오) `/p/{id}` → 단축 주소 → `/p/{id}?pass=…` 리디렉트 사슬, 주소창은 `/p/{id}`, 방문 1건(유입 호스트 유지) → 같은 주소를 다시 열면 또 단축 주소를 거침 |
| `operator.spec.ts` | 3 운영자 | 방문 3·순 방문자 2·클릭 1을 만든 뒤 `/admin` 검색 → 목록의 최근 30일 방문 → 상세 통계 합계가 DB와 일치, 분포 표(유입 경로·기기·브라우저·운영체제)·링크별 클릭, 390px 확인 → 슬롯 1개 부여 후 크리에이터가 관리 화면 시트로 6번째 링크 추가 → 도메인 차단 후 랜딩에서 링크 사라짐·클릭 주소 안내·관리 화면에 차단 표시와 사유 → 하위 도메인 링크 저장 거부 안내(시트 안) → 크리에이터의 `/admin`·상세 접근은 권한 없음 |
| `notices.spec.ts` | 4 안내 화면 | 빈 랜딩은 준비 중 문구와 크리링 표시로 열림(390px) → 없는 단축 주소는 `/notice?reason=link_not_found` → 운영자가 정지하면 단축 URL은 `/notice?reason=creator_suspended`, `/p/{id}`도 정지 안내, 링크 클릭 주소는 `link_unavailable`, 크리에이터 세션은 끊겨 `/me`가 홈으로 |
| `guestbook.spec.ts` | 방명록 1~8 | 크리에이터·작성자·다른 회원·비회원 컨텍스트로 `/p/{id}#guestbook`(단축 주소를 거쳐도 해시와 방명록 탭 유지) → 비회원 빈 상태·`로그인하고 남기기`(`returnTo`) → 작성자의 공개글·비밀글 → 비회원·다른 회원은 공개글만(BFF 응답 원문에도 비밀글 없음, 버튼 없음) → 크리에이터 숨김 시 비회원·다른 회원에게서 사라지고 작성자에게는 숨김 표시 없이 그대로, 숨김 해제 → 작성자 삭제 → 관리 화면 스위치로 끄면 탭 없음·API 404 `guestbook_disabled`, 켜면 남은 글 → 이름 없는 작성자 '크리링 회원', 긴 글 390px |

실제 구글 로그인(키 발급 후)과 인스타그램 인앱 브라우저 확인은 이 테스트 범위 밖이며 설계의 [위험과 스파이크](../../docs/specs/crelink-mvp.md#위험과-스파이크)대로 수동으로 확인합니다.
