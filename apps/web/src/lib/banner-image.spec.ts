// 배너 이미지 쌍 올리기(설계 docs/specs/crelink-ad-banner.md `정지 이미지 만들기`). 실행: pnpm --filter @crelink/web test
import type { UploadFileResponse } from '@crelink/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BANNER_STILL_OPTIONS, StillImageError, uploadBannerImage, type BannerImageDeps } from './banner-image.ts';
import { stillCrop } from './still-image.ts';

function fakeDeps(animated: boolean, overrides: Partial<BannerImageDeps> = {}) {
  const uploads: string[] = [];
  const stills: Array<{ name: string; options: unknown }> = [];
  const deps: BannerImageDeps = {
    upload: async (file): Promise<UploadFileResponse> => {
      uploads.push(file.name);
      const fileId = `file-${uploads.length}`;
      return { fileId, url: `/api/files/${fileId}`, animated: uploads.length === 1 ? animated : false };
    },
    makeStill: async (file, options) => {
      stills.push({ name: file.name, options });
      return new File([new Uint8Array([1])], 'banner-still.png', { type: 'image/png' });
    },
    ...overrides,
  };
  return { deps, uploads, stills };
}

const GIF = new File([new Uint8Array([0x47, 0x49, 0x46])], 'banner.gif', { type: 'image/gif' });

describe('배너 이미지 쌍 올리기(uploadBannerImage)', () => {
  it('움직이지 않는 이미지는 한 번만 올리고 정지 이미지가 없다', async () => {
    const { deps, uploads, stills } = fakeDeps(false);
    assert.deepEqual(await uploadBannerImage(GIF, deps), {
      image: { fileId: 'file-1', url: '/api/files/file-1' },
      stillImage: null,
    });
    assert.deepEqual(uploads, ['banner.gif']);
    assert.equal(stills.length, 0);
  });

  it('animated 응답이면 같은 로컬 파일에서 3:1 1200×400 기준 정지 이미지를 만들어 둘째로 올린다', async () => {
    const { deps, uploads, stills } = fakeDeps(true);
    assert.deepEqual(await uploadBannerImage(GIF, deps), {
      image: { fileId: 'file-1', url: '/api/files/file-1' },
      stillImage: { fileId: 'file-2', url: '/api/files/file-2' },
    });
    assert.deepEqual(uploads, ['banner.gif', 'banner-still.png']);
    assert.deepEqual(stills, [
      { name: 'banner.gif', options: { aspect: { width: 3, height: 1 }, max: { width: 1200, height: 400 } } },
    ]);
  });

  it('첫 장면을 만들지 못하면 StillImageError로 쌍 전체가 실패하고 둘째 업로드를 하지 않는다', async () => {
    const { deps, uploads } = fakeDeps(true, {
      makeStill: async () => {
        throw new DOMException('decode', 'InvalidStateError');
      },
    });
    await assert.rejects(uploadBannerImage(GIF, deps), StillImageError);
    assert.deepEqual(uploads, ['banner.gif']);
  });

  it('정지 이미지 업로드가 실패하면 그 오류로 쌍 전체가 실패한다', async () => {
    const failure = new Error('upload failed');
    let calls = 0;
    const { deps } = fakeDeps(true);
    const upload = deps.upload;
    deps.upload = async (file) => {
      calls += 1;
      if (calls === 2) throw failure;
      return upload(file);
    };
    await assert.rejects(uploadBannerImage(GIF, deps), (caught) => caught === failure);
  });
});

describe('배너 정지 이미지 자르기 크기(공유 상수)', () => {
  it('1200×400 이하 3:1로 잘리고 PNG 원시 크기가 4MB 업로드 한도 안이다', () => {
    for (const [width, height, expected] of [
      [480, 270, { width: 480, height: 160 }],
      [1920, 1080, { width: 1200, height: 400 }],
      [3600, 600, { width: 1200, height: 400 }],
      [600, 200, { width: 600, height: 200 }],
      [800, 800, { width: 800, height: 267 }],
    ] as const) {
      const crop = stillCrop({ width, height }, BANNER_STILL_OPTIONS);
      assert.deepEqual({ width: crop.width, height: crop.height }, expected, `${width}×${height}`);
      assert.ok(crop.width * crop.height * 4 < 4 * 1024 * 1024);
    }
  });
});
