# 0069 업로드 움직임 판정(animated)

- 단계: 티켓
- 역할: api
- 상위: 0063
- 선행: 0067
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T3입니다. 요구는 R20 ④, R21 ②입니다.

## 수용 기준

- [x] 움직임 판정: 업로드 때 GIF·WebP·APNG 판정, `files.animated`, `UploadFileResponse.animated`, NULL 파일 지연 판정 도우미. 단위 테스트(세 형식의 움직임·정지 표본). 미정 1이 A·D면 만들지 않습니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T3
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ④, R21 ②
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(미정 1 C, 통합 브랜치 위 격리 작업공간). 새 의존성 없음.
  - `src/files/animated-image.ts` `isAnimatedImage(contentType, data)`: GIF는 블록 구조(전역·지역 색표, 확장·LZW 하위 블록)를 따라 이미지 서술자 2개 이상, WebP는 `VP8X` 애니메이션 플래그(0x02) 또는 `ANIM` 청크, PNG는 `IDAT` 앞 `acTL`. 잘린 파일은 움직임 근거가 없으면 false.
  - `FilesService.upload`가 판정해 `files.animated`에 저장하고 `UploadFileResponse`(`animated`)를 돌려줌. `FilesController`의 T1 임시 `animated: false` 제거.
  - 지연 판정 도우미 `FilesService.isAnimated(db, fileId)`: 값이 있으면 그대로, NULL이면 `FileStorage.get` 바이트로 판정해 `UPDATE … WHERE animated IS NULL`로 채움. 행·저장소 객체가 없거나 uuid가 아니면 404 `file_not_found`. 배너 저장(0070·0071)의 정지 이미지 규칙이 씁니다.
  - 문서: `apps/api/docs/README.md` 크리에이터 규칙 `움직임 판정`, `apps/api/CHANGELOGS.md`.
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`, 격리 인스턴스 `PORT_SLOT=41`).
  - 단위 `src/files/animated-image.spec.ts` 6건 통과: 표본 `test/image-samples.ts`(GIF 직접 구성 2프레임·1프레임+0x2C 주석, ffmpeg APNG·PNG, img2webp 움직이는 WebP, cwebp 손실·무손실·VP8X 정지), `ANIM`만 있는 WebP, `IDAT` 뒤 `acTL`, 잘린 파일·JPEG·모르는 형식.
  - 통합 `test/upload-animated.e2e-spec.ts` 3건 통과(세 형식 움직임·정지 응답과 `files.animated`, NULL 지연 판정·채운 값 재사용, 행·객체 없음 404). 전체 API 143/143.
  - `make up` 뒤 실제 `POST /api/me/files`: ffmpeg GIF 2프레임 201 `animated: true`, ffmpeg GIF 1프레임 `false`, PNG `false`, APNG `true`, 움직이는 WebP `true`, 세션 없음 401.
  - `pnpm verify --fast` 통과, `pnpm verify` 통과, `pnpm work:scope 0069 --base HEAD` 통과.
