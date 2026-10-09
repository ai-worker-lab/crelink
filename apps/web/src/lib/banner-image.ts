/**
 * 배너 이미지 올리기(설계 docs/specs/crelink-ad-banner.md `정지 이미지 만들기`). 배너 폼과 운영자 광고 배너 대화상자가
 * `ImageField`의 배너 모드로 씁니다. 원본을 올리고, 응답이 `animated`이면 사용자가 고른 로컬 `File`에서 첫 장면을
 * 3:1(`BANNER_ASPECT_RATIO`)로 잘라 최대 `BANNER_STILL_SIZE` PNG로 만든 뒤 함께 올려 한 쌍으로 돌려줍니다.
 * 올린 주소에서 다시 받지 않습니다. 브라우저 API(fetch·canvas)는 부르는 쪽이 넘겨 단위 시험에서 바꿀 수 있습니다.
 */
import { BANNER_ASPECT_RATIO, BANNER_STILL_SIZE, type ImageRef, type UploadFileResponse } from '@crelink/shared';

/** 배너 이미지 한 쌍. `stillImage`는 원본이 움직일 때만 있고, 저장 요청의 `stillImageFileId`가 됩니다. */
export interface BannerImage {
  image: ImageRef;
  stillImage: ImageRef | null;
}

/** 정지 이미지 자르기 기준. 공개 랜딩·미리보기와 같은 공유 상수입니다. */
export const BANNER_STILL_OPTIONS = { aspect: BANNER_ASPECT_RATIO, max: BANNER_STILL_SIZE } as const;

/** 첫 장면을 만들지 못했을 때(브라우저가 파일을 해석하지 못함 등). 원본만 올라간 반쪽 쌍은 쓰지 않습니다. */
export class StillImageError extends Error {
  constructor(cause: unknown) {
    super('움직이는 이미지의 첫 장면을 만들지 못했습니다.', { cause });
    this.name = 'StillImageError';
  }
}

export interface BannerImageDeps {
  /** `POST /api/me/files` 한 번. 실패하면 던집니다. */
  upload: (file: File) => Promise<UploadFileResponse>;
  /** `makeStillImage`(`still-image.ts`). */
  makeStill: (file: File, options: typeof BANNER_STILL_OPTIONS) => Promise<File>;
}

/**
 * 원본과(움직이면) 정지 이미지를 차례로 올립니다. 둘째 업로드나 첫 장면 만들기가 실패하면 쌍 전체를 실패로 던집니다
 * (첫 장면 만들기 실패는 `StillImageError`, 업로드 실패는 `upload`가 던진 오류 그대로).
 */
export async function uploadBannerImage(file: File, deps: BannerImageDeps): Promise<BannerImage> {
  const uploaded = await deps.upload(file);
  const image: ImageRef = { fileId: uploaded.fileId, url: uploaded.url };
  if (!uploaded.animated) return { image, stillImage: null };
  let still: File;
  try {
    still = await deps.makeStill(file, BANNER_STILL_OPTIONS);
  } catch (caught) {
    throw new StillImageError(caught);
  }
  const stillUploaded = await deps.upload(still);
  return { image, stillImage: { fileId: stillUploaded.fileId, url: stillUploaded.url } };
}
