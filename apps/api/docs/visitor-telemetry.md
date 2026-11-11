# 공개 랜딩 방문자 계측

기존 단축 주소의 요청 방문·302 클릭 기록에 더해, 실제 브라우저가 표시·클릭·노출·활성 체류·최대 스크롤과 언어·시간대·화면 크기를 보고합니다. 이 값은 브라우저 보고이며 실제 사람이나 사용자 신원을 인증하는 자료가 아닙니다. 수집 1차에서는 통계 화면을 제외했고 이후 [크리에이터·서비스 조회](analytics.md)를 추가했습니다. 외부 픽셀·GPS·폼 신원 수집은 없습니다. 계약은 [공유 타입](../../../packages/shared/src/telemetry.ts), 구현은 [서비스](../src/telemetry/landing-events.service.ts), 저장은 [migration 0009](../migrations/0009_landing_telemetry.sql)가 기준입니다.

## 토큰과 익명 연결

`GET {SHORT}/{slug}`는 기존 host-only `cl_vid` 쿠키를 유지하고, 새 통과 표시에 그 익명 UUID를 서명으로 바인딩합니다. 구형 `expires.signature` 통과 표시는 계속 유효하지만 브라우저 계측 토큰을 발급하지 않습니다. 유효한 새 통과 표시로 공개 랜딩 API를 읽으면 `telemetryToken`과 `telemetrySessionKey`를 받습니다. 같은 익명 방문자는 토큰이 바뀌어도 같은 키를 받고, 쿠키를 삭제·차단하여 방문자 UUID가 바뀌면 브라우저 세션도 바꿉니다. 관리 미리보기처럼 통과 표시가 없으면 둘 다 null입니다.

계측 토큰은 랜딩 공개 ID·익명 방문자·원 통과 표시 발급 시각·만료를 HMAC으로 묶고 목적을 분리합니다. 수명은24시간이며 토큰 자체는 관리 인증 쿠키와 무관합니다. 본인 방문 표시(0233)는 페이지뷰에서만 `cl_session`을 `AuthService.sessionUserId`로 확인해 랜딩 소유자이면 `landing_events.is_owner`를 true로 두고, 같은 페이지뷰의 이후 이벤트는 그 값을 따릅니다. 세션이 없거나 무효이거나 확인에 실패해도 표시 없이 저장합니다. 계정 ID·세션은 저장하지 않습니다. 기존 통과 표시처럼 키가 API 프로세스의 메모리에 있으므로 배포·재시작 뒤 기존 토큰은 무효가 될 수 있습니다. 이때 계측만 중단하고 공개 페이지·외부 링크 이동은 계속 동작합니다.

웹과 단축 도메인의 쿠키를 `Domain`으로 넓혀 공유하지 않습니다. 이벤트 IP·국가·도시·리퍼러 호스트·UA·기기·브라우저·OS는 같은 단축 주소·익명 방문자의 원 방문에서만 복사합니다. 원 통과 표시의 초 단위 발급 시각 전5초~후60초 안에서 가장 가까운 `visits` 행을 찾습니다. 비동기 원 방문 저장이 늦거나 해당 기록이 없으면 null로 두며 BFF 소켓 IP·Node UA로 추정하지 않습니다. 여러 탭의 근접 방문은 원 방문과 일대일 연결을 보장하지 않습니다.

## API와 검증

`POST /api/landings/{publicId}/events`는 정상·멱등 재전송에204를 반환합니다. 설정된 웹 URL의 정확한 Origin과 JSON만 받고 본문은16KiB로 제한합니다. 임의 쿼리·URL·헤더 덤프를 받지 않습니다. 전달되는 세션·페이지 표시·이벤트 ID는 UUID여야 하며, 이미 사용한 ID의 랜딩·익명 방문자·세션 소유 바인딩을 바꾸면403입니다. 초기 `page_view`를 수락한 뒤 해당 표시의 다른 이벤트를 받습니다.

| 종류 | 저장 의미 |
| --- | --- |
| `page_view` | 같은 pageViewId에 하나. 최초 언어·시간대·뷰포트·화면·DPR·UTM 문맥 |
| `click` | 같은 랜딩의 실제 링크·SNS·포트폴리오·크리에이터 배너·광고 배너 대상 |
| `impression` | 같은 페이지 표시·대상 조합에 하나. URL 없는 포트폴리오·크리에이터 배너도 노출 가능 |
| `engagement` | 누적 활성 밀리초·최대 스크롤 비율. page_view 앵커 행에는 GREATEST로 갱신하여 재시도·순서 역전에 더하지 않음 |

입력은 공유 계약의 필드만 허용합니다. 유효한 대상 ID·랜딩 소유권·링크 숨김/차단·배너 게시/슬롯/스위치·계정 정지를 서버에서 확인합니다. 세션과 페이지 표시는 트랜잭션 advisory lock, 이벤트·페이지 표시·노출 중복은 DB unique index로 막습니다. 새 브라우저 클릭은 기존 `link_clicks`·`creator_banner_clicks`·광고 카운터와 별개입니다. 합쳐 클릭 합계를 만들면 중복됩니다.

방문자별 분당120건, 원 방문에서 확인한 IP별 분당240건으로 제한합니다. BFF의 공유 소켓이나 임의 XFF를 IP로 쓰지 않으며 확인한 IP가 없으면 방문자 제한만 적용합니다. 방문자 한도를 먼저 검사하여 이미 차단된 방문자의 요청이 같은 NAT의 IP 한도를 계속 소모하지 못하게 합니다. 한 pageViewId에는 최대500개 원본 행을 저장합니다. 제한 기록은15분 뒤 정리합니다. 이 수치는 현재 구현 선택이며 실제 사람 방문 보증이나 완전한 봇 차단 수단이 아닙니다.

## UTM과 보존

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id` 여섯 값만 각각200자까지 보존합니다. 단축·웹 리디렉트는 공유 helper로 이 값만 다음 고정 URL에 덧붙입니다. 중복 값과 제어 문자는 버리고 이메일 등 나머지 쿼리는 저장하지 않습니다. UTM 내용은 사용자가 URL에 붙인 문자열이므로 민감한 값을 넣지 않아야 합니다. 원 단축 방문의 UTM은 `visits.utm`에, 브라우저 보고는 `landing_events.utm`에 저장됩니다.

채널별 짧은 주소 `GET {SHORT}/s/{code}`는 예외로 요청 쿼리의 `utm_*`를 무시하고 **저장된 프리셋**(`source`·`medium`·`campaign`·`content`, `id`=code)을 `visits.utm`에 넣습니다. 리디렉트 주소에는 UTM 대신 `via={code}`만 붙고, 공개 랜딩 API가 `via`로 같은 프리셋 `utm`을 내려 주면 웹이 그 값을 `VisitorTracker`로 보고해 `landing_events.utm`도 같아집니다. 근거 [채널별 짧은 주소 설계](../../../docs/specs/channel-links.md).

기존 `RetentionService`의 같은 트랜잭션·365일/Asia/Seoul 기준으로 `landing_events`를 일별·단축 주소·종류·대상 집계로 옮긴 뒤 원본을 삭제합니다. 집계에는 이벤트 수·일별 순 방문자 수·일별 순 세션 수·활성 시간 합·최대 스크롤이 남고, 이후 [0010](../migrations/0010_analytics_rollups.sql)에서 클릭한 표시·스크롤·노출 후 클릭 카운터와 언어·UTM 등을 값별 분포로 남기도록 확장했습니다. 방문자·세션·페이지뷰·이벤트 UUID와 IP·원문 UA는 집계에 남기지 않습니다. 단축 주소·콘텐츠 대상 식별자는 집계 구분에 사용합니다. 활성 시간은 page_view 앵커 값만 합하며 engagement 원본의 누적값을 더하지 않습니다. 일별 순 방문자·세션 합은 기간 전체 고유 수와 다릅니다. 원 방문 source FK는 원본 삭제 시 null이 되며 별도 복사된 이벤트 문맥은 이벤트의 보존 기한을 따릅니다.

새 집계는 기존 302 통계에 합산하지 않습니다. 수집 1차 다음 작업에서 [본인·관리자 조회](analytics.md)를 구현했고, 기존 StatsService도 같은 읽기 스냅샷으로 바꿔 보존 전환 경쟁을 막습니다.

## 검사

[통합 테스트](../test/landing-events.e2e-spec.ts)는 실제 일회용 PostgreSQL에서 토큰·Origin·입력·대상 소유권·숨김·정지·멱등·동시 바인딩·여러 방문자가 같은 BFF를 쓰는 제한 회귀·보존 실패 롤백을 확인합니다. 위치 조회는 기존 테스트용 GeoIpService이므로 실제 mmdb 정확성을 뜻하지 않습니다. [서명 테스트](../src/short-link/landing-pass.service.spec.ts)와 [UTM 테스트](../../../packages/shared/src/telemetry.spec.ts)도 함께 실행합니다.

```sh
pnpm --filter @crelink/shared test
pnpm --filter @crelink/api test --runInBand landing-events short-link landing-pass
pnpm --filter @crelink/api typecheck
```
