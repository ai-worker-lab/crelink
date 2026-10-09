# 0067 광고 배너 계약·스키마(shared·migration 0003·설정값)

- 단계: 티켓
- 역할: api
- 상위: 0063
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T1입니다. 요구는 R20, R21입니다.

## 수용 기준

- [x] 계약·스키마. 대상: `packages/shared`의 위 타입·경로·오류 코드·상수, `resolveBannerSlot`과 그 단위 테스트(`packages/shared` `test` 스크립트), migration `0003_ad_banner.sql`(`lock_timeout`, 되돌리기 주석), `AppConfig` `BANNER_SLOT_MAX`·`BANNER_SLOT_TOTAL_MAX`, `.env.example`·환경변수 문서. 확인: `pnpm --filter @crelink/shared build`, `pnpm --filter @crelink/shared test`, migration 테스트(FK 연쇄 2건·CHECK), AppConfig 파싱 테스트. 미정 1·2가 확정된 뒤 착수합니다. 전체 typecheck는 통합 브랜치에서 T2·T5·T9·T10 뒤에 확인합니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T1
- 요구: [PRD](../../product/crelink.md#요구사항) R20, R21
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간, 미정 1 C·2 A 반영).
  - shared `src/crelink.ts`: 설계 `공유 타입 초안` 그대로 타입·필수 필드, 오류 코드 6개, `CRELINK_LIMITS.bannerAltMax`·`BANNER_ASPECT_RATIO`·`BANNER_STILL_SIZE`, `CRELINK_API_PATHS` 9개, `resolveBannerSlot`. `package.json` `test`(`node --test 'src/**/*.spec.ts'`), `tsconfig.json`이 spec을 빌드에서 뺌. 단위 테스트 `src/banner-slot.spec.ts` 55건(종류·위치 3가지와 n 이상·앞 링크 숨김·숨김 표 12칸 × 위치 3가지).
  - 설계 초안과 다른 점(모양 변화 없음): `resolveBannerSlot` 입력·결과 타입에 이름(`ResolveBannerSlotInput<B>`·`ResolvedBannerSlot<B>`)을 붙여 내보냄. `LinkOrderRequest`는 `ReorderRequest`를 확장(필드 같음). `UploadFileResponse`는 `type` 별칭에서 `interface … extends ImageRef`로.
  - migration `0003_ad_banner.sql`: 첫 줄 `SET LOCAL lock_timeout = '5s'`, 머리 주석 되돌리기 SQL, 설계 `데이터 모델` 표의 컬럼·FK·CHECK·인덱스. `creator_banners.image_file_id`는 설계대로 동작 지정 없음(NO ACTION, 문장 끝 검사라 크리에이터 삭제의 같은 문장 연쇄를 막지 않음).
  - `AppConfig`: `parseBannerSlotLimits`·`bannerSlotLimits`, `onModuleInit` 검사. `apps/api/.env.example`, `apps/api/docs/README.md#환경변수`.
  - 전체 typecheck를 위한 최소 연결(빈 값·null, 다음 티켓이 채움): API `CreatorService.landingState`(`slot` 광고·맨 뒤·미부여, `adBanners`·`banners` 빈 배열, `bannerLimits` 설정값·사용 0 → 0068), `PublicLandingController` `blocks[].slot: null`(→ 0068), `FilesController.upload` `animated: false`(→ 0069), `AdminService.detail` `bannerSlot.grantedAt: null`·`banners: []`·`bannerLimits`(→ 0072), `StatsService.stats` `bannerClicks: []`(→ 0073). 웹 `src/lib/api/errors.ts` 고정 문구 6개, `toLandingPreview` `slot: null`(→ 0079), `landing-preview.spec.ts` fixture. 기존 시험 기대값: `test/health.e2e-spec.ts`(테이블 5개·0003), `test/admin.e2e-spec.ts`(`bannerClicks`), `test/short-link.e2e-spec.ts`(`slot: null`).
  - 시험 추가: `test/migrations.e2e-spec.ts` 0003 5건(기존 행 NULL·`lock_timeout` 한정, (a) 배너·정지 이미지 있는 크리에이터 삭제 → 배너·파일·클릭·집계 0건, 정지 이미지 `SET NULL`·클릭 사본 유지, (b) 운영자 삭제 23503, CHECK 9종), `src/config.service.spec.ts` 4건.
  - 범위: `pnpm work:scope 0067`은 웹 파일 3개(`errors.ts`·`landing-preview.ts`·`landing-preview.spec.ts`)와 `apps/web/CHANGELOGS.md`를 소유 밖으로 보고합니다. orchestrator 지시(전체 typecheck 통과용 최소 연결)에 따른 것입니다.
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`).
  - `pnpm --filter @crelink/shared build` 통과, `pnpm --filter @crelink/shared test` 55/55 통과.
  - `make infra-up` 뒤 `pnpm --filter @crelink/api test -- test/migrations.e2e-spec.ts src/config.service.spec.ts` 26/26 통과.
  - `pnpm verify --fast` 통과(lint·typecheck 전체). `pnpm verify` 통과(shared 55, web 13, API 125/125).
  - 격리 인스턴스(`PORT_SLOT=37`, Compose project `crelink-t1contract`)에서 `make up` 뒤 실제 요청: `GET /api/me/landing` 200(`slot` `{kind:'ad', slotIndex:null, grantedAt:null}`, `bannerLimits` 5·20)·세션 없음 401, `GET /api/public/landings/{id}` 200(`blocks[0].slot: null`)·없는 랜딩 404, `GET /api/admin/creators/{id}` 200(`bannerSlot`·`banners`·`bannerLimits`)·크리에이터 세션 403, `GET …/stats` 200(`bannerClicks: []`), `POST /api/me/files` GIF 201(`animated: false`)·파일 없음 400. `BANNER_SLOT_MAX=6 BANNER_SLOT_TOTAL_MAX=5`로 `node dist/main.js` 기동 거부(종료 코드 1, 키 이름만 담은 오류). `pnpm smoke` 5/5 통과.
- 2026-10-09: 0085 통합에서 확인하고 `완료`로 바꿨습니다. 슬롯 0 인스턴스(통합 브랜치 코드로 재기동, migration `0003_ad_banner` 적용)에서 공유 계약을 실제 API·웹이 끝까지 씁니다. `tests/e2e/ad-banner.spec.ts` 4/4, 전체 `pnpm e2e` 12/12, `pnpm verify` 통과(API 175/175).
