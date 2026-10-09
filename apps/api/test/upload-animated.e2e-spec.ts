import { randomUUID } from 'node:crypto';
import { ApiError, UploadFileResponse } from '@crelink/shared';
import { FilesService } from '../src/files/files.service';
import { GIF_ANIMATED, GIF_STILL, PNG_ANIMATED, PNG_STILL, WEBP_ANIMATED, WEBP_LOSSY } from './image-samples';
import { createTestApp, login, TestApp } from './test-app';

/** 업로드 움직임 판정(0069): `files.animated`, `UploadFileResponse.animated`, NULL 파일 지연 판정(`FilesService.isAnimated`). */
describe('업로드 움직임 판정 (R20 ④, R21 ②)', () => {
  let t: TestApp;
  let cookie: string;
  let userId: string;

  const upload = async (data: Buffer, type: string) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type }), 'image');
    const response = await fetch(`${t.baseUrl}/api/me/files`, { method: 'POST', headers: { cookie }, body: form });
    const body: UploadFileResponse & Partial<ApiError> = await response.json();
    return { status: response.status, body };
  };
  const storedAnimated = async (fileId: string) =>
    (await t.pool.query<{ animated: boolean | null }>('SELECT animated FROM files WHERE id = $1', [fileId])).rows[0]
      .animated;

  beforeAll(async () => {
    t = await createTestApp();
    const result = await login(t.baseUrl, 'animated-1|animated1@example.com');
    cookie = result.cookie!;
    userId = result.body.user!.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('GIF·WebP·APNG는 움직이면 animated true, 정지면 false로 응답하고 files.animated에 저장한다', async () => {
    for (const [data, type, animated] of [
      [GIF_ANIMATED, 'image/gif', true],
      [GIF_STILL, 'image/gif', false],
      [WEBP_ANIMATED, 'image/webp', true],
      [WEBP_LOSSY, 'image/webp', false],
      [PNG_ANIMATED, 'image/png', true],
      [PNG_STILL, 'image/png', false],
    ] as const) {
      const response = await upload(data, type);
      expect([type, response.status, response.body.animated]).toEqual([type, 201, animated]);
      expect(response.body).toEqual({ fileId: expect.any(String), url: expect.any(String), animated });
      expect(await storedAnimated(response.body.fileId)).toBe(animated);
    }
  });

  it('지연 판정: animated가 NULL인 파일은 저장소 바이트로 판정해 채우고, 채운 값은 다시 읽지 않는다', async () => {
    const files = t.app.get(FilesService);
    const moving = (await upload(GIF_ANIMATED, 'image/gif')).body.fileId;
    const still = (await upload(PNG_STILL, 'image/png')).body.fileId;
    await t.pool.query('UPDATE files SET animated = NULL WHERE id = ANY($1::uuid[])', [[moving, still]]);

    expect(await files.isAnimated(t.pool, moving)).toBe(true);
    expect(await files.isAnimated(t.pool, still)).toBe(false);
    expect([await storedAnimated(moving), await storedAnimated(still)]).toEqual([true, false]);

    // 저장된 값이 있으면 그대로 씁니다(바이트를 다시 읽지 않음).
    await t.pool.query('UPDATE files SET animated = false WHERE id = $1', [moving]);
    expect(await files.isAnimated(t.pool, moving)).toBe(false);
  });

  it('지연 판정: 파일 행이나 저장소 객체가 없으면 404 file_not_found', async () => {
    const files = t.app.get(FilesService);
    const missingObject = randomUUID();
    await t.pool.query(
      "INSERT INTO files (id, owner_user_id, storage_key, content_type, size) VALUES ($1, $2, $3, 'image/gif', 10)",
      [missingObject, userId, missingObject],
    );
    for (const fileId of [randomUUID(), 'not-a-uuid', missingObject]) {
      await expect(files.isAnimated(t.pool, fileId)).rejects.toMatchObject({
        status: 404,
        response: { code: 'file_not_found' },
      });
    }
    expect(await storedAnimated(missingObject)).toBeNull();
  });
});
