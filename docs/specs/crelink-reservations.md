# 링크별 사전 신청 기술 설계

- 상태: 승인 (2026-11-10 개발실. 근거: 사용자 위임과 [ADR 0016](../adr/0016-devoffice-takeover.md) 결정 1. 운영 공개는 별도 사용자 승인)
- 작성일: 2026-11-10
- 에픽: `docs/work/epics/0212-link-reservations.md`
- 입력: [PRD](../product/crelink.md) R29~R32

구현 기준은 코드(`packages/shared`, `apps/api/migrations/0013_link_reservations.sql`)입니다. 이 문서는 계획이며 구현과 다른 점은 `변경 기록`에 남깁니다.

## 요구 대응

| 요구 | 화면 | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R29 | 공개 버튼·시트, 링크 편집 | `POST …/reservations`, `PUT …/reservation` | `links` 컬럼 2개, `link_reservations` | 0213(API), 0219·0220(웹) |
| R30 | 신청 목록·내려받기 | `GET`·`DELETE /api/me/reservations` | `link_reservations` | 0213, 0220 |
| R31 | 메뉴·버튼 없음 | 플래그 404 | 없음 | 0213, 0224 |
| R32 | 없음 | 없음 | 2단계 | [2단계](#2단계-방문자-계정-분리), 0225 |

## 구성과 흐름

공개 제출: 브라우저 → 웹 BFF(`visitorEvent` 규칙: 세션 제거, Origin 전달, 16KB) → `POST /api/landings/{publicId}/links/{linkPublicId}/reservations` → 플래그, Origin, 입력 키, 토큰, 레이트 리밋, 봇 판정, 입력 형식, 트랜잭션.

## 데이터 모델

`0013_link_reservations.sql`, 첫 줄 `SET LOCAL lock_timeout = '5s'`, 추가만 합니다.

- `links.reservation_state`(`off|open|closed`, 기본 `off`), `links.reservation_methods text[]`(`email|phone`, 기본 빈 배열).
- `link_reservations`: `id`, `link_id`(CASCADE), `method`, `contact`, `consent_version`, `created_at`. `UNIQUE(link_id, method, contact)`, 인덱스 `(link_id, created_at DESC, id DESC)`, `(created_at)`.
- 정규화: 이메일은 소문자, 254자 이하, 첫 글자 영숫자. 휴대폰은 `01[016-9]` 숫자만, `+82`는 `0`으로 바꿉니다. 규칙은 `normalizeReservationContact`(shared) 하나입니다.
- 보존 90일 `[임시값]`. `RetentionService.runOnce`의 같은 트랜잭션에서 지우고 플래그와 무관합니다. 링크 삭제는 CASCADE입니다.
- 추가만 하므로 Blue/Green과 롤백이 안전합니다. 운영 데이터가 생긴 뒤에는 지우지 않고 다음 migration으로 고칩니다.

## API 계약

타입과 오류 코드의 원본은 `packages/shared/src/crelink.ts`입니다.

| 메서드·경로 | 권한 | 요청 | 성공 | 주요 오류 |
| --- | --- | --- | --- | --- |
| `POST /api/landings/{publicId}/links/{linkPublicId}/reservations` | 공개, Origin·토큰 | `{token, method, contact, consent:true, website?}` | 201 `{status:'received'}` | 400 `reservation_contact_invalid`·`validation_failed`, 403 `forbidden`·`reservation_session_expired`, 404 `reservation_unavailable`, 409 `reservation_closed`, 410 `creator_suspended`, 413, 429 `reservation_rate_limited` |
| `PUT /api/me/links/{id}/reservation` | 본인 | `{state, methods}` | `LinkReservationSetting` | 400 `validation_failed`, 404 `link_not_found` |
| `GET /api/me/reservations?linkId=&cursor=` | 본인 | | `ReservationPage` | 400(커서), 404 `link_not_found` |
| `GET /api/me/reservations/export?linkId=` | 본인 | | `text/csv` | 404 `link_not_found` |
| `DELETE /api/me/reservations/{id}` | 본인 | | 204 | 404 `reservation_not_found` |
| `DELETE /api/me/links/{id}/reservations` | 본인 | | 204 | 404 `link_not_found` |

`LinkView.reservation?`, `PublicLinkView.reservation?`, `CreatorLandingState.reservationsAvailable?`는 선택 필드입니다. `open`·`closed`는 방식 1개 이상이 필요하고 `off`는 빈 배열을 허용합니다.

**플래그:** `AppConfig.reservationsEnabled`는 값이 정확히 `true`일 때만 참입니다. 꺼지면 세션 검사보다 먼저 404(`not_found`, 없는 경로와 같은 응답)이고 공개 응답에 필드가 없습니다. 웹에는 플래그가 없고 API 응답만 따릅니다.

## 화면 상태와 API 대응

웹은 다음 PR(0219, 0220)입니다. 공개 랜딩은 `<a class="link-card">` 형제로 `사전 신청` 버튼(터치 44px)을 둡니다.

| 화면 상태 | 조건 | 표시 |
| --- | --- | --- |
| 기본 | `open`, 토큰 있음 | 방식 선택(1개면 라벨만), 입력, 미체크 동의, 제출 |
| 입력 오류 | 클라이언트 검증 또는 400 | 필드 아래 안내, 포커스 이동, 값 유지 |
| 제출 중 | POST 중 | 버튼 잠금, 시트 닫기 막음 |
| 완료 | 201 | "접수되었어요. 같은 연락처는 한 번만 접수돼요" |
| 중복 | 이 브라우저의 표식(`localStorage`, 링크 ID만) | "이미 신청했어요"와 `다른 연락처로 신청`. 서버 중복은 완료와 같음 |
| 마감·꺼짐 | `closed`·409, 필드 없음·404 | `신청 마감` 배지, 버튼 없음 |
| 다시 열기 | 토큰 없음·403 | `shortUrl`로 이동 |
| 429·네트워크 | | 값 유지, 다시 시도 |
| 긴 텍스트 | 제목 60자, 표시명 40자, 이메일 254자 | `overflow-wrap:anywhere`, 카드 고정 높이 금지 |

390px 리스트 8·10·12형과 320px 2열 그리드에서 가로 넘침이 없어야 합니다. 관리 화면은 `LinkForm`에 상태·방식을 넣고 목록은 `data-table is-stacked`로 그리며, 목록 화면에서 의견 보내기를 뺍니다.

## 권한·보안·개인정보

- 권한: `me` 경로는 전부 소유자 조건과 `@ActorKinds('human')`입니다. 남의 대상은 404입니다. 운영자 경로는 만들지 않습니다.
- 남용 방지 `[임시값]`: 10분에 방문자 5, IP 30, 링크 600(`reservation:` 접두사로 방문 이벤트와 분리). 봇은 숨김 필드 `website` 또는 서명된 방문 시각 3초 미만이면 201·저장 안 함입니다. CAPTCHA는 넣지 않습니다. 중복은 `ON CONFLICT DO NOTHING`이고 링크별 advisory lock 안에서 5,000건을 검사합니다.
- 동의 문구 초안(법률 미검토, 필수·미체크): "[크리에이터 이름]의 '[링크 제목]' 사전 신청에 동의해요. 수집: 입력한 이메일 또는 휴대폰 번호, 신청 시각. 목적: 신청 접수와 크리에이터의 안내 연락. 보유: 신청일로부터 90일, 크리에이터가 먼저 지우면 그때까지. 제공받는 자: 이 페이지의 크리에이터가 열람하고 내려받아요. 크리링은 메일·문자를 보내지 않아요. 동의하지 않을 수 있고, 그러면 신청만 할 수 없어요." 판 번호는 `RESERVATION_CONSENT_VERSION`입니다.
- 크리에이터 고지(켤 때): 안내 목적으로만 쓰고, 내려받은 파일은 직접 관리·삭제해야 하며, 90일 자동 삭제가 파일에는 미치지 않습니다.
- 처리방침 변경 지점(0223): 새 절(방명록 뒤), 이용 목적, 보관 기간, 쿠키·저장소, 열람 권한. 수집하지 않는 동안 사실과 다른 고지가 되지 않게 출시 티켓에서 반영합니다.
- 값 차단: 연락처는 POST 본문에만 두고 URL에 넣지 않습니다. 서비스 코드는 값을 로그·메시지에 쓰지 않습니다. 앱 검증과 `ON CONFLICT`로 PG 오류 상세를 만들지 않습니다. 시트 열기·제출은 `landing_events`에 넣지 않습니다. Sentry 로그 정리에 휴대폰 패턴을 더했습니다.
- CSV: 첫 글자가 `= + - @`, 전각 `＝＋－＠`, 탭, CR이면 `'`를 붙이고 모든 셀을 큰따옴표로 감싸며 UTF-8 BOM을 붙입니다.
- 법률 확인 필요(이 문서는 법률 판단이 아닙니다): 크리링과 크리에이터의 지위와 동의 구조, 안내 연락의 광고성 정보 해당 여부, 만 14세 미만 처리, "상품" 표현의 통신판매 관련 의무, 연락처 평문 저장과 열람·내려받기 기록의 필요 여부, 계정 없는 방문자의 삭제·철회 창구, 처리방침 사전 공지 기간.

## 비기능 요구

운영자 경로를 만들지 않아 영향 범위가 본인으로 한정됩니다. 신청 지표는 비목표입니다. 내려받기는 링크당 5,000건 상한으로 메모리 안에서 만듭니다.

## 위험과 스파이크

- 머지는 곧 운영 배포이므로 migration은 플래그와 무관하게 적용됩니다. 추가만 해 허용 범위입니다.
- IP 30건은 통신사 공유 IP에서 실사용자를 막을 수 있어 `[임시값]`입니다.
- 토큰 서명 키는 프로세스마다 달라 배포 뒤 옛 토큰은 403 `reservation_session_expired`가 됩니다. 웹은 `다시 열기`로 잇습니다.
- 배포 순간 입력 중인 값은 저장하지 않으므로 사라집니다.

## 2단계 방문자 계정 분리

- 로그인 의도 쿠키(`cl_return_to` 방식)로 회원 진입을 표시하고, 그때는 `users`와 신원만 만듭니다. 랜딩 등은 명시적 "내 크리링 만들기" 때 생성합니다.
- 랜딩 전제 경로(`landingState`, `/me`)와 운영자 목록·지표에 랜딩 없음 처리를 넣습니다.
- `link_reservations`에 `applicant_user_id`를 추가하고 `contact`를 NULL 허용으로 바꿉니다(추가만). BFF는 세션을 전달하는 별도 규칙을 씁니다.
- 1단계는 이 작업을 막지 않습니다. "첫 로그인자는 크리에이터로 가입" 결정의 변경은 사용자 결정입니다(2단계 착수 전).

## 티켓 분해

0212 에픽, 0213(문서·공유 계약·API, 0213~0218 묶음)은 이 브랜치에서 처리합니다. 이후 번호는 웹·QA·통합·출시이며 착수 시 파일을 만듭니다.

| 번호 | 역할 | 선행 | 목표 |
| --- | --- | --- | --- |
| 0219 | web | 0213 | 공개 버튼·시트, BFF 규칙 |
| 0220 | web | 0213 | 설정, 목록, 내려받기, 의견 버튼 제거 |
| 0221 | crelink-qa | 0213, 0219, 0220 | 7절 시나리오 |
| 0222 | orchestrator | 0221 | 통합, 변경 기록, 플래그 끈 채 배포 |
| 0223 | web `보류/종료` | 0222, 법률 판단 | 처리방침 |
| 0224 | infra `보류/종료` | 0223, 사용자 승인 | 운영 플래그 켜기 |
| 0225 | orchestrator `분류 대기` | 0222 | 2단계 스파이크 |

## 검증 계획

API에서 시험 가능한 7절 시나리오는 `apps/api/test/reservation-{settings,submit,manage}.e2e-spec.ts`, `migrations.e2e-spec.ts`, `sentry.e2e-spec.ts`, `monitoring/sentry.spec.ts`에 있습니다. 브라우저 시나리오는 0221입니다.

- 권한 우회: A 세션으로 B의 `linkId` 목록·내보내기, 설정 PUT, 신청 삭제를 시도하면 전부 404이고 행이 유지됩니다. 비로그인은 401, AI Bearer는 403입니다. 운영자 응답에는 연락처 값이 없습니다. 다른 랜딩의 토큰이나 `linkPublicId`는 거절됩니다.
- 비공개 링크: 숨김·차단·`off`는 필드가 없고 POST가 404, 정지는 410입니다. 기존 신청은 목록에 남습니다.
- 꺼진 상태: 미설정, `TRUE`, `1`, ` true`이면 DB가 `open`이어도 전 경로 404, 필드 없음, 메뉴 없음입니다. 91일 지난 행은 삭제됩니다.
- 대량 제출: 같은 토큰 6번째, 같은 IP의 서로 다른 방문자 31번째는 429입니다. 숨김 필드와 3초 미만은 201·0행입니다. 같은 연락처 동시 20건은 전부 201·1행입니다. 5,000건 도달 시 409, 16KB 초과는 413입니다. 이때 방문 이벤트 한도는 줄지 않습니다.
- 유출: 신청 후 Sentry 전송 페이로드와 API 로그에 값이 없습니다. CSV에 `=1+1@x.com`, 제목 `=HYPERLINK(...)`, 따옴표·줄바꿈을 넣어 파서로 확인합니다.

## 미정

- R32 회원 방식(2단계). 법률 검토 여부와 운영 플래그 켜기는 사용자 결정입니다(0224 착수 전).

## 검토 기록

- 2026-11-10 개발실 CTO: 코드 사실 대조 후 설계 작성. 원문은 개발실 보고로 보관합니다.

## 변경 기록

- 2026-11-10: 0213 구현에서 정한 세부(설계 원문에 없던 것). 플래그가 꺼지면 404 본문은 `reservation_unavailable`이 아니라 없는 경로와 같은 `not_found`입니다. 입력 형식 검사는 설계의 처리 순서대로 레이트 리밋·봇 판정 뒤에 둡니다. `off`는 방식 0개를 허용합니다.
