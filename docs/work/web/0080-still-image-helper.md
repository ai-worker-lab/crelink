# 0080 정지 이미지 도우미(ImageField 확장)

- 단계: 티켓
- 역할: web
- 상위: 0063
- 선행: 0067, 0075
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T12입니다. 요구는 R20 ④, R21 ②입니다.

## 수용 기준

- [x] 정지 이미지 도우미: `ImageField`의 3:1 미리보기·안내 문구 prop, `animated` 응답이면 정지 이미지를 만들어 쌍으로 올림. 단위 테스트(자르기 크기), 브라우저 확인. 미정 1이 A·D면 만들지 않습니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T12
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ④, R21 ②
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간, 0082와 한 번에).
  - `src/lib/banner-image.ts`: `uploadBannerImage(file, { upload, makeStill })`가 원본을 올리고, 응답이 `animated`이면 같은 로컬 `File`에서 `makeStillImage(file, BANNER_STILL_OPTIONS)`(공유 `BANNER_ASPECT_RATIO`·`BANNER_STILL_SIZE`)로 정지 PNG를 만들어 둘째로 올린 뒤 `BannerImage { image, stillImage }` 쌍을 돌려줌. 첫 장면 만들기 실패는 `StillImageError`, 둘째 업로드 실패는 그 오류 그대로 쌍 전체 실패. 브라우저 API는 인자로 받아 단위 시험이 바꿈.
  - `ImageField`: `banner` prop(배너 모드: 3:1 미리보기 240×80, 기본 도움말 `BANNER_IMAGE_HELP` = handoff 배너 폼 문구, `지우기` 버튼, 값·`onChange`가 `BannerImage`)과 `help` prop(두 모드 모두 안내 문구 바꾸기). 기존 단일 이미지 모드는 그대로. 첫 장면 실패는 웹 전용 코드 `still_image_failed`(`errors.ts`, `움직이는 이미지의 첫 장면을 만들지 못했어요. 다른 이미지를 골라 주세요.`)로 기존 이미지 오류 줄에 보임. 정지 이미지를 함께 올렸으면 도움말 끝에 `움직이는 이미지라 첫 장면 정지 이미지를 함께 올렸어요.`
  - 쓰는 쪽(T13 0081, T16 0084): `<ImageField banner label=… value={BannerImage | null} onChange=… />`, 저장 요청은 `imageFileId: value.image.fileId`, `stillImageFileId: value.stillImage?.fileId ?? null`. 수정 폼 처음 값은 `{ image, stillImage }`(`CreatorBannerView`·`AdBannerView` 그대로).
  - 단위 테스트 `src/lib/banner-image.spec.ts` 5건: 움직이지 않으면 업로드 1번·정지 없음, `animated`면 같은 파일로 3:1·1200×400 기준 정지 이미지를 만들어 둘째로 올림, 첫 장면 실패면 `StillImageError`·둘째 업로드 없음, 둘째 업로드 실패면 쌍 실패, 공유 상수로 자른 크기 5가지(480×270 → 480×160, 1920×1080·3600×600 → 1200×400, 600×200 그대로, 800×800 → 800×267)와 PNG 원시 크기 4MB 미만.
  - 디자인 인계와 다른 점: handoff의 `이미지 고르기`는 기존 `ImageField`처럼 기본 파일 입력입니다(별도 버튼 없음). 첫 장면 실패 문구와 정지 이미지 안내 한 줄은 handoff에 없어 더했습니다(기존 이미지 오류 줄·도움말 자리).
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`).
  - `pnpm --filter @crelink/web test` 27/27 통과(새 5건 포함), `pnpm --filter @crelink/web typecheck` 통과, 바꾼 파일 `prettier`·`eslint` 통과, `pnpm verify --fast` 통과.
  - 브라우저(Playwright Chromium, 1280·390px): 아직 배너 모드를 쓰는 화면이 없어(T13·T16) 임시 확인 화면(확인 뒤 지움)과 계약 `UploadFileResponse` mock API(`GIF`로 시작하면 `animated: true`, 저장소 밖 `.local/`)로 확인. S1 표본 `anim-1500x900.gif` → 업로드 2번(원본 GIF, `anim-1500x900-still.png` 1200×400 PNG 11,024B), 값의 `stillImage.fileId`가 둘째 업로드, 미리보기 240×80(3:1), 도움말 문구. `animated: false` 응답(WebP) → `stillImage: null`. 깨진 GIF(`GIF89a…`) → `still_image_failed` 오류 줄. 가로 넘침 0, 콘솔 오류 0.
  - 실제 API의 `animated` 판정은 T3(0069) 뒤에 연결됩니다. 지금 API는 늘 `false`라 정지 이미지를 만들지 않습니다(0067 최소 연결).
- 2026-10-09: 0085 통합에서 실제 API(0069 판정)로 확인하고 `완료`로 바꿨습니다. 운영자 대화상자에서 GIF를 올리면 `움직이는 이미지라 첫 장면 정지 이미지를 함께 올렸어요.`가 보입니다. 저장된 배너의 `still_file_id` 파일은 `animated = false`이고 원본은 `true`입니다(`tests/e2e/ad-banner.spec.ts`).
