# 0246 채널별 짧은 주소 (API·웹·인프라 통합)

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

인스타그램 등 외부에 UTM·슬러그·채널 이름이 드러나지 않는 짧은 주소 `{SHORT}/s/{code}`를 만들고, 그 주소로 들어온 방문의 UTM 소스를 통계에 채널별 값으로 남깁니다. 한 브랜치(`work/0246-channel-links`)가 api·web·infra 경로를 함께 바꾸므로 이 티켓은 `orchestrator` 통합 티켓이고, 영역별 세부는 [0247](../web/0247-channel-links-web.md)(web)·[0248](../infra/0248-channel-links-edge.md)(infra)에 있습니다. api 몫은 migration·`/s/` 경로·관리 API·공개 랜딩 `via`·공유 계약입니다.

## 수용 기준

설계 [채널별 짧은 주소](../../specs/channel-links.md#수용-기준) 1~9를 `apps/api/test` e2e(실제 일회용 PostgreSQL)로 확인합니다.

- [x] 1. `GET /s/{code}`가 302 `/p/{publicId}?pass=…&via={code}`이고 Location에 `utm_`이 없다.
- [x] 2. `visits.utm`·`page_view`의 `utm`이 저장 프리셋과 같고 요청 쿼리의 `utm_*`는 무시된다.
- [x] 3. 없는 code·삭제된 페이지는 `link_not_found`, 정지 계정은 `creator_suspended`.
- [x] 4. 보관한 code는 계속 302이고 목록에서만 빠진다.
- [x] 5. 페이지를 SQL로 지우면 `channel_links`는 사라지고 `channel_link_codes`는 남아 같은 code가 발급되지 않는다.
- [x] 6. 다른 사용자의 페이지에 대한 `GET`·`POST`·보관이 거부된다.
- [x] 7. 같은 조합의 동시 `POST`에도 활성 행은 1개이고 한도 초과는 거부된다.
- [x] 8. 기존 `/{slug}`·`/c/`·`/a/`·`/b/`·수동 `?utm_*` 시험이 그대로 통과한다(`health.e2e-spec.ts`의 경로·표·migration 목록만 갱신).
- [x] 6-1. 0243 기준 소유자 전용: 멤버는 목록·생성·보관이 403 `page_owner_only`, `/s/`·`via`는 공개.
- [x] 9. pass 만료·없음 + `via`는 `/s/{code}`를 한 번 거쳐 루프가 없고 다른 페이지의 code는 무시된다.

## 범위

- 포함: `apps/api/**`(migration `0015_channel_links.sql`, `/s/` 경로, `/api/me/channel-links`, 공개 랜딩 `via`, 시험), `packages/shared/**`(프리셋·한도·API 경로·타입·시험), 영향 문서와 변경 기록.
- 제외: 통계 화면 한글 라벨, 주소별 클릭 수, 직접 입력 채널, 보관 해제, 운영자 대행 경로.

## 위험·복구

되돌리기 어려운 migration(새 표 2개)과 공개 단축 경로가 있습니다. 운영 장애면 직전 릴리스로 롤백하고 migration은 되돌리지 않습니다(새 표는 기존 코드가 읽지 않아 남겨 둠). 적용 뒤 파일명을 바꾸면 기동이 막힙니다.

## 연결

- 설계: [채널별 짧은 주소](../../specs/channel-links.md)
- 운영 안내: [백엔드 API](../../../apps/api/docs/README.md#채널별-짧은-주소), [방문 계측](../../../apps/api/docs/visitor-telemetry.md)
- 같은 설계의 웹·인프라: [0247](../web/0247-channel-links-web.md), [0248](../infra/0248-channel-links-edge.md)

## 진행 기록

- 2026-11-10: 생성. 설계 승인("좋아 그럼 그렇게 진행하자.") 뒤 구현.
- 2026-11-10: 구현. migration `0015_channel_links`, `GET /s/{code}`, `/api/me/channel-links`, 공개 랜딩 `via`, 공유 계약 `channel-links.ts`와 오류 코드 3개. `test/channel-links.e2e-spec.ts`(12건)를 실제 일회용 PostgreSQL로 실행해 수용 기준 1~7·9가 통과했고 `test/health.e2e-spec.ts`(경로·표·migration 목록 갱신)도 통과했습니다. 공유 시험 131건 통과.
- 2026-11-10: `pnpm verify` 8단계 통과(통과 8, 실패 0). `pnpm ci:local`은 work:scope만 실패하고 나머지 10단계(verify, ego smoke·analytics-responsive·visitor·signup-funnel, 이미지 api·web)는 통과했습니다. 한 브랜치가 api·web·infra 경로를 함께 바꾸는데 `work:scope`는 브랜치 번호 0246의 역할 api 범위만 허용합니다. 이 티켓을 `orchestrator`(여러 영역 통합) 역할로 바꾸거나 영역별 브랜치로 나눠야 `--report`가 가능합니다. 판단은 사용자 몫이라 바꾸지 않았습니다.
- 2026-11-10: 병합 전 확인할 것: 독립 `qa` 합격, `gh workflow run CI --ref work/0246-channel-links`, `0014_*` migration 두 개가 다른 브랜치에 있어도 적용 여부를 파일명 전체로 보므로 병합 순서는 무관합니다.
- 2026-11-10: CEO 결정으로 역할을 api에서 `orchestrator` 통합 티켓으로 바꿨습니다(한 브랜치가 세 영역을 바꾸므로 `work:scope`가 api 범위만 허용해 실패했기 때문). 0247(web)·0248(infra)은 그대로입니다. origin/main 63997c5(0243)에 rebase해 충돌 5건(`apps/api/CHANGELOGS.md`, `apps/api/docs/README.md`, `creator.controller.ts`, `health.e2e-spec.ts`, `packages/shared/src/crelink.ts`)을 양쪽 내용을 합쳐 풀고, `ChannelLinksController`를 `PageAccessGuard`+`@PageOwnerOnly()`로 소유자 전용으로 만들었습니다.
