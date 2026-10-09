import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stillCrop, stillFileName } from './still-image.ts';

const BANNER = { aspect: { width: 3, height: 1 }, max: { width: 1200, height: 400 } };

describe('정지 이미지 자르기(stillCrop)', () => {
  it('3:1보다 높은 원본은 위아래를 같은 양만큼 잘라 1200×400으로 줄인다', () => {
    assert.deepEqual(stillCrop({ width: 1500, height: 900 }, BANNER), {
      sx: 0,
      sy: 200,
      sw: 1500,
      sh: 500,
      width: 1200,
      height: 400,
    });
  });

  it('3:1보다 넓은 원본은 좌우를 같은 양만큼 잘라 낸다', () => {
    assert.deepEqual(stillCrop({ width: 3000, height: 500 }, BANNER), {
      sx: 750,
      sy: 0,
      sw: 1500,
      sh: 500,
      width: 1200,
      height: 400,
    });
  });

  it('정확히 3:1이고 최대보다 크면 자르지 않고 줄이기만 한다', () => {
    assert.deepEqual(stillCrop({ width: 2400, height: 800 }, BANNER), {
      sx: 0,
      sy: 0,
      sw: 2400,
      sh: 800,
      width: 1200,
      height: 400,
    });
  });

  it('잘라 낸 영역이 최대보다 작으면 키우지 않는다', () => {
    assert.deepEqual(stillCrop({ width: 300, height: 300 }, BANNER), {
      sx: 0,
      sy: 100,
      sw: 300,
      sh: 100,
      width: 300,
      height: 100,
    });
  });

  it('나누어떨어지지 않는 크기는 반올림하고, 남는 홀수 픽셀은 오른쪽·아래에서 더 잘린다', () => {
    // 500×333: 3:1 높이 166.67 → 167, 위 83·아래 83
    assert.deepEqual(stillCrop({ width: 500, height: 333 }, BANNER), {
      sx: 0,
      sy: 83,
      sw: 500,
      sh: 167,
      width: 500,
      height: 167,
    });
    // 1001×300: 3:1 너비 900, 왼쪽 50·오른쪽 51
    assert.deepEqual(stillCrop({ width: 1001, height: 300 }, BANNER), {
      sx: 50,
      sy: 0,
      sw: 900,
      sh: 300,
      width: 900,
      height: 300,
    });
  });

  it('아주 작은 원본도 1픽셀 아래로 내려가지 않는다', () => {
    assert.deepEqual(stillCrop({ width: 1, height: 1 }, BANNER), {
      sx: 0,
      sy: 0,
      sw: 1,
      sh: 1,
      width: 1,
      height: 1,
    });
  });

  it('출력은 늘 최대 크기 안이고 비율은 3:1에서 1픽셀 넘게 벗어나지 않는다', () => {
    for (const [width, height] of [
      [4096, 4096],
      [7000, 1000],
      [1199, 401],
      [640, 480],
      [1080, 1920],
      [12000, 3999],
    ] as const) {
      const crop = stillCrop({ width, height }, BANNER);
      assert.ok(crop.width <= 1200 && crop.height <= 400, `${width}×${height} → ${crop.width}×${crop.height}`);
      assert.ok(Math.abs(crop.width - crop.height * 3) <= 3, `${width}×${height} → ${crop.width}×${crop.height}`);
      assert.ok(crop.sx >= 0 && crop.sy >= 0 && crop.sx + crop.sw <= width && crop.sy + crop.sh <= height);
    }
  });

  it('크기가 0이거나 숫자가 아니면 RangeError', () => {
    assert.throws(() => stillCrop({ width: 0, height: 100 }, BANNER), RangeError);
    assert.throws(() => stillCrop({ width: 100, height: Number.NaN }, BANNER), RangeError);
    assert.throws(
      () => stillCrop({ width: 100, height: 100 }, { ...BANNER, aspect: { width: 3, height: 0 } }),
      RangeError,
    );
  });
});

describe('정지 이미지 파일 이름(stillFileName)', () => {
  it('확장자를 떼고 -still.png를 붙인다', () => {
    assert.equal(stillFileName('banner.gif'), 'banner-still.png');
    assert.equal(stillFileName('my.banner.webp'), 'my.banner-still.png');
    assert.equal(stillFileName('no-ext'), 'no-ext-still.png');
    assert.equal(stillFileName('.gif'), 'image-still.png');
  });
});
