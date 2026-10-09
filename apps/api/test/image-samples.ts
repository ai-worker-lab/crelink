/**
 * 움직임 판정 시험 표본(4×4 이하). GIF는 아래 바이트로 직접 만들고, PNG·WebP는 ffmpeg·img2webp·cwebp로 만든 파일의 base64입니다.
 * - PNG_ANIMATED: `ffmpeg -f lavfi -i testsrc=s=4x4:r=5:d=0.4 -plays 0 -f apng` (acTL 2프레임)
 * - PNG_STILL: 같은 입력 `-frames:v 1`
 * - WEBP_ANIMATED: `img2webp -loop 0 -lossless f1.png -d 100 f2.png` (VP8X 애니메이션 플래그 + ANIM + ANMF 2개)
 * - WEBP_LOSSY·WEBP_LOSSLESS: `cwebp` / `cwebp -lossless` (VP8 / VP8L 단순 형식)
 * - WEBP_EXTENDED_STILL: 반투명 PNG를 `cwebp` (VP8X + ALPH, 애니메이션 플래그 없음)
 */

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** 1×1, 전역 색표 2색(흰·검정). */
const GIF_HEADER = [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0xff, 0xff, 0xff, 0, 0, 0];
/** 무한 반복(NETSCAPE2.0) 확장. */
const GIF_LOOP = [0x21, 0xff, 0x0b, ...ascii('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0];
/** 내용이 이미지 서술자 표지(0x2C)와 같은 바이트인 주석 확장. 판정이 확장 안을 세지 않는지 봅니다. */
const GIF_COMMENT = [0x21, 0xfe, 3, ...ascii(',,,'), 0];

/** 그래픽 제어 확장(지연 0.1초) + 1×1 이미지 서술자 + LZW 데이터. localColors면 지역 색표 2색을 붙입니다. */
function gifFrame(localColors: boolean): number[] {
  return [
    ...[0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00],
    ...[0x2c, 0, 0, 0, 0, 1, 0, 1, 0, localColors ? 0x80 : 0x00],
    ...(localColors ? [0, 0, 0, 0xff, 0xff, 0xff] : []),
    ...[0x02, 0x02, 0x44, 0x01, 0x00],
  ];
}

export const GIF_ANIMATED = Buffer.from([...GIF_HEADER, ...GIF_LOOP, ...gifFrame(false), ...gifFrame(true), 0x3b]);
export const GIF_STILL = Buffer.from([...GIF_HEADER, ...GIF_COMMENT, ...gifFrame(false), 0x3b]);

export const PNG_ANIMATED = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAABAAAAAQBPJcTWAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAAEAAAABAAAAAAAAAAAAAEABQAAXC5E3AAAACdJREFUeJw9iUEKADAIwxLw4f68U4TlUFIiEDC7xVoi3vnU1MaJLQ8FTAoMnzDusgAAABpmY1RMAAAAAQAAAAQAAAABAAAAAAAAAAMAAQAFAADFMgoeAAAAGWZkQVQAAAACeJxj/G/M4HuGYcvZ/5tNGAAmCgW0tJvEUQAAAABJRU5ErkJggg==',
  'base64',
);
export const PNG_STILL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAJ0lEQVR4nD2JQQoAMAjDEvDh/rxThOVQUiIQMLvFWiLe+dTUxoktDwVMCgyfMO6yAAAAAElFTkSuQmCC',
  'base64',
);
export const WEBP_ANIMATED = Buffer.from(
  'UklGRsgAAABXRUJQVlA4WAoAAAACAAAAAwAAAwAAQU5JTQYAAAD/////AABBTk1GSgAAAAAAAAAAAAMAAAMAAGQAAAJWUDhMMQAAAC8DwAAARyAQSNofeg0BQdF1ywkIivwfbf4D2SAmMPEBWYBp1GL3XBKIJYci+h+NyAcAQU5NRkoAAAAAAAAAAAADAAADAABkAAAAVlA4TDEAAAAvA8AAAEcgEEjaH3oNAUHRdcsJCIr8H23+gw9iAhvFB2QBptErhUAGMZ8ciuh/NCI7AA==',
  'base64',
);
export const WEBP_LOSSY = Buffer.from(
  'UklGRmQAAABXRUJQVlA4IFgAAADwAQCdASoEAAQAAgA0JbAC7C0MwbAAsggA/t4db80WP9/3W2S3oBOY7Z5EqKv/5cn/Y//m6Xk7+aKYEMyf//5xV+V/xgW/5N//+Rp/0YF+f/9Tf/OoJIAA',
  'base64',
);
export const WEBP_LOSSLESS = Buffer.from(
  'UklGRj4AAABXRUJQVlA4TDEAAAAvA8AAAEcgEEjaH3oNAUHRdcsJCIr8H23+A9kgJjDxAVmAadRi91wSiCWHIvofjcgHAA==',
  'base64',
);
export const WEBP_EXTENDED_STILL = Buffer.from(
  'UklGRmAAAABXRUJQVlA4WAoAAAAQAAAAAwAAAwAAQUxQSAoAAAABB9C/iAhERP8DVlA4IDAAAADQAQCdASoEAAQAAgA0JaACdLoB+AADsAD+8MQL/yC5YXXI1/8gP+QH/ID/+PIAAAA=',
  'base64',
);
