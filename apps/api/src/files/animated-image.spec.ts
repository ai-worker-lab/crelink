import {
  GIF_ANIMATED,
  GIF_STILL,
  PNG_ANIMATED,
  PNG_STILL,
  WEBP_ANIMATED,
  WEBP_EXTENDED_STILL,
  WEBP_LOSSLESS,
  WEBP_LOSSY,
} from '../../test/image-samples';
import { isAnimatedImage } from './animated-image';

describe('isAnimatedImage (GIF·WebP·APNG 움직임 판정)', () => {
  it('GIF: 이미지 서술자 2개 이상이면 움직임, 1개면 정지(확장 안의 0x2C는 세지 않음)', () => {
    expect(isAnimatedImage('image/gif', GIF_ANIMATED)).toBe(true);
    expect(isAnimatedImage('image/gif', GIF_STILL)).toBe(false);
  });

  it('WebP: VP8X 애니메이션 플래그·ANIM이면 움직임, VP8·VP8L·플래그 없는 VP8X는 정지', () => {
    expect(isAnimatedImage('image/webp', WEBP_ANIMATED)).toBe(true);
    expect(isAnimatedImage('image/webp', WEBP_LOSSY)).toBe(false);
    expect(isAnimatedImage('image/webp', WEBP_LOSSLESS)).toBe(false);
    expect(isAnimatedImage('image/webp', WEBP_EXTENDED_STILL)).toBe(false);
  });

  it('WebP: 플래그가 꺼져 있어도 ANIM 청크가 있으면 움직임', () => {
    const flagOff = Buffer.from(WEBP_ANIMATED);
    flagOff[20] &= ~0x02;
    expect(isAnimatedImage('image/webp', flagOff)).toBe(true);
  });

  it('PNG: IDAT 앞 acTL이면 움직임(APNG), 없으면 정지', () => {
    expect(isAnimatedImage('image/png', PNG_ANIMATED)).toBe(true);
    expect(isAnimatedImage('image/png', PNG_STILL)).toBe(false);
  });

  it('PNG: IDAT 뒤에 온 acTL은 APNG가 아니다', () => {
    const idat = PNG_STILL.indexOf('IDAT') - 4;
    const actl = PNG_ANIMATED.subarray(PNG_ANIMATED.indexOf('acTL') - 4, PNG_ANIMATED.indexOf('acTL') + 16);
    const late = Buffer.concat([PNG_STILL.subarray(0, idat + 12 + PNG_STILL.readUInt32BE(idat)), actl]);
    expect(isAnimatedImage('image/png', late)).toBe(false);
  });

  it('잘린 파일·JPEG·모르는 형식은 예외 없이 false', () => {
    for (const [type, data] of [
      ['image/gif', GIF_ANIMATED.subarray(0, GIF_ANIMATED.length - 20)],
      ['image/gif', GIF_ANIMATED.subarray(0, 8)],
      ['image/webp', WEBP_ANIMATED.subarray(0, 14)],
      ['image/png', PNG_ANIMATED.subarray(0, 20)],
      ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
      ['text/plain', GIF_ANIMATED],
    ] as const) {
      expect(isAnimatedImage(type, data)).toBe(false);
    }
  });
});
