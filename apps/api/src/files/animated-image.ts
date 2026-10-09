/**
 * 움직이는 이미지(GIF·움직이는 WebP·APNG) 판정(R20 ④, R21 ②). 새 의존성 없이 파일 구조만 읽습니다.
 * 근거: docs/specs/crelink-ad-banner.md `서버 규칙` 움직임 판정. 잘리거나 깨진 파일은 끝까지 읽은 만큼으로 판정합니다(움직임 근거가 없으면 false).
 */

/** GIF: 이미지 서술자(0x2C)가 2개 이상이면 움직임. 블록 구조를 따라가며 LZW 데이터 안의 바이트는 세지 않습니다. */
function gifAnimated(data: Buffer): boolean {
  if (data.length < 13) return false;
  let offset = 13;
  // 논리 화면 서술자의 전역 색표(packed 최상위 비트, 크기 3 × 2^(n+1)).
  const screenPacked = data[10];
  if (screenPacked & 0x80) offset += 3 * 2 ** ((screenPacked & 0x07) + 1);
  const skipSubBlocks = (start: number): number => {
    let position = start;
    while (position < data.length && data[position] !== 0) position += data[position] + 1;
    return position + 1;
  };
  let frames = 0;
  while (offset < data.length) {
    const introducer = data[offset];
    if (introducer === 0x3b) break;
    if (introducer === 0x21) {
      // 확장: 표지·라벨 다음 하위 블록들.
      offset = skipSubBlocks(offset + 2);
    } else if (introducer === 0x2c) {
      if (offset + 10 > data.length) break;
      frames += 1;
      if (frames >= 2) return true;
      const imagePacked = data[offset + 9];
      offset += 10;
      if (imagePacked & 0x80) offset += 3 * 2 ** ((imagePacked & 0x07) + 1);
      // LZW 최소 코드 크기 1바이트 다음 하위 블록들.
      offset = skipSubBlocks(offset + 1);
    } else {
      break;
    }
  }
  return false;
}

/** WebP: `VP8X` 애니메이션 플래그(0x02) 또는 `ANIM` 청크. */
function webpAnimated(data: Buffer): boolean {
  let offset = 12;
  while (offset + 8 <= data.length) {
    const type = data.toString('latin1', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (type === 'VP8X' && offset + 8 < data.length && data[offset + 8] & 0x02) return true;
    if (type === 'ANIM') return true;
    // 청크 내용은 짝수 길이로 채워집니다.
    offset += 8 + size + (size % 2);
  }
  return false;
}

/** PNG: `IDAT` 앞 `acTL` 청크(APNG). */
function pngAnimated(data: Buffer): boolean {
  let offset = 8;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('latin1', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += 12 + length;
  }
  return false;
}

/** 업로드 형식(`detectImageType` 결과)별 움직임 판정. JPEG와 모르는 형식은 false. */
export function isAnimatedImage(contentType: string, data: Buffer): boolean {
  switch (contentType) {
    case 'image/gif':
      return gifAnimated(data);
    case 'image/webp':
      return webpAnimated(data);
    case 'image/png':
      return pngAnimated(data);
    default:
      return false;
  }
}
