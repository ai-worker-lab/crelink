/**
 * 움직이는 배너(GIF·움직이는 WebP·APNG)의 첫 장면 정지 이미지를 사용자가 고른 로컬 `File`에서 만듭니다.
 * 근거와 브라우저별 결과는 `docs/work/web/0075-gif-first-frame-spike.md`에 있습니다.
 *
 * 비율과 최대 크기는 부르는 쪽이 공유 상수(`BANNER_ASPECT_RATIO`, `BANNER_STILL_SIZE`)로 넘깁니다.
 */

export interface StillSize {
  width: number;
  height: number;
}

/** 원본에서 잘라 낼 영역(`sx`·`sy`·`sw`·`sh`)과 출력 크기(`width`·`height`). 모두 정수 픽셀입니다. */
export interface StillCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  width: number;
  height: number;
}

export interface StillImageOptions {
  /** 자를 비율. 예: `{ width: 3, height: 1 }`. */
  aspect: StillSize;
  /** 출력 최대 크기. 원본 영역이 더 작으면 키우지 않습니다. */
  max: StillSize;
}

function assertPositive(size: StillSize, label: string): void {
  if (!(size.width > 0 && size.height > 0) || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    throw new RangeError(`${label} 크기가 올바르지 않습니다: ${size.width}×${size.height}`);
  }
}

/**
 * 원본 크기에서 가운데 기준 `aspect` 비율 영역을 고르고, `max` 안에 들도록 줄인 출력 크기를 셉니다.
 * 원본이 비율보다 넓으면 좌우를, 높으면 위아래를 같은 양만큼 잘라 냅니다(홀수 픽셀은 오른쪽·아래가 1 더 잘림).
 */
export function stillCrop(source: StillSize, { aspect, max }: StillImageOptions): StillCrop {
  assertPositive(source, '원본');
  assertPositive(aspect, '비율');
  assertPositive(max, '최대');
  const wider = source.width * aspect.height > source.height * aspect.width;
  const sw = wider ? Math.max(1, Math.round((source.height * aspect.width) / aspect.height)) : source.width;
  const sh = wider ? source.height : Math.max(1, Math.round((source.width * aspect.height) / aspect.width));
  const scale = Math.min(1, max.width / sw, max.height / sh);
  return {
    sx: Math.floor((source.width - sw) / 2),
    sy: Math.floor((source.height - sh) / 2),
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
}

/** `photo.gif` → `photo-still.png`. */
export function stillFileName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, '') || 'image';
  return `${base}-still.png`;
}

/**
 * 로컬 `File`의 첫 장면을 가운데 기준으로 잘라 PNG `File`로 만듭니다(투명도 유지).
 * 첫 장면은 `createImageBitmap(file)`로 얻습니다. S1에서 Chromium·Firefox·WebKit과 iOS 시뮬레이터 Safari 모두
 * GIF·움직이는 WebP·APNG의 첫 장면을 돌려줬습니다. `ImageDecoder`는 iOS Safari에 없고 macOS WebKit에서는
 * 잘라 그리기·투명도가 깨져 쓰지 않습니다. `<img>`를 거치면 WebKit의 `createImageBitmap(img)`가 지금 장면을 돌려줍니다.
 * 해석할 수 없는 파일이면 브라우저의 `DOMException`(`InvalidStateError` 등)을 그대로 던집니다.
 */
export async function makeStillImage(file: File, options: StillImageOptions): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const crop = stillCrop({ width: bitmap.width, height: bitmap.height }, options);
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d 문맥을 만들 수 없습니다.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.width, crop.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG로 바꿀 수 없습니다.');
    return new File([blob], stillFileName(file.name), { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
