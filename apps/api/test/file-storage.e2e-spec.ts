import { Logger } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { ApiError, UploadFileResponse } from '@crelink/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from '../src/config.service';
import { FileStorage, LocalDiskFileStorage } from '../src/files/file-storage';
import { S3FileStorage } from '../src/files/s3-file-storage';
import { createTestApp, login, TestApp } from './test-app';
import { startTestS3, TestS3 } from './test-s3';

// 일회용 SeaweedFS 컨테이너(이미지 받기 포함)를 기다립니다.
jest.setTimeout(180_000);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

let s3: TestS3;
let uploadDir: string;
const s3Storages: S3FileStorage[] = [];

beforeAll(async () => {
  // S3FileStorage가 직접 만든 Logger로 남기는 버킷 확인 로그를 시험 출력에서 끕니다(결과는 checkBucket 반환값으로 확인).
  Logger.overrideLogger(false);
  s3 = await startTestS3();
  uploadDir = mkdtempSync(join(tmpdir(), 'crelink-uploads-'));
});

afterAll(() => {
  for (const storage of s3Storages) storage.onModuleDestroy();
  s3?.stop();
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});

function s3Storage(config = s3.config): S3FileStorage {
  const storage = new S3FileStorage(config);
  s3Storages.push(storage);
  return storage;
}

const implementations: Array<[string, () => FileStorage]> = [
  [
    'disk',
    () => {
      process.env.UPLOAD_DIR = uploadDir;
      return new LocalDiskFileStorage(new AppConfig());
    },
  ],
  ['s3', () => s3Storage()],
];

describe.each(implementations)('FileStorage 계약: %s', (_name, create) => {
  let storage: FileStorage;
  beforeAll(() => {
    storage = create();
  });

  it('put한 바이트를 get이 그대로 돌려준다(4MB 이진 데이터)', async () => {
    const key = randomUUID();
    const data = randomBytes(4 * 1024 * 1024);
    await storage.put(key, data);
    expect((await storage.get(key))?.equals(data)).toBe(true);
  });

  it('없는 key는 null이다', async () => {
    expect(await storage.get(randomUUID())).toBeNull();
  });

  it('같은 key로 다시 put하면 실패하고 처음 내용이 남는다', async () => {
    const key = randomUUID();
    await storage.put(key, Buffer.from('first'));
    await expect(storage.put(key, Buffer.from('second'))).rejects.toThrow();
    expect((await storage.get(key))?.toString()).toBe('first');
  });

  it('같은 key 동시 put은 하나만 성공하고 그 내용이 남는다', async () => {
    const key = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) => storage.put(key, Buffer.from(`value-${index}`))),
    );
    const winners = results.flatMap((result, index) => (result.status === 'fulfilled' ? [index] : []));
    expect(winners).toHaveLength(1);
    expect((await storage.get(key))?.toString()).toBe(`value-${winners[0]}`);
  });
});

describe('S3FileStorage 버킷 확인과 자격 증명', () => {
  it('버킷에 닿으면 true, 자격 증명이 틀리면 false이고 put도 실패한다', async () => {
    expect(await s3Storage().checkBucket()).toBe(true);
    const wrong = s3Storage({ ...s3.config, secretAccessKey: 'wrong-secret' });
    expect(await wrong.checkBucket()).toBe(false);
    await expect(wrong.put(randomUUID(), PNG)).rejects.toThrow();
  });

  it('없는 버킷이면 false다(앱 identity는 버킷을 만들 수 없음)', async () => {
    expect(await s3Storage({ ...s3.config, bucket: 'crelink-missing' }).checkBucket()).toBe(false);
  });
});

describe('FILE_STORAGE=s3로 띄운 API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: s3.env });
  });

  afterAll(async () => {
    await t?.close();
  });

  it('S3FileStorage를 쓰고, 업로드한 이미지가 버킷의 UUID key에 저장되어 GET /api/files/{id}로 같은 바이트가 나온다', async () => {
    expect(t.app.get(FileStorage)).toBeInstanceOf(S3FileStorage);
    const { cookie } = await login(t.baseUrl, 's3-creator|s3-creator@example.com');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'image.png');
    const response = await fetch(`${t.baseUrl}/api/me/files`, {
      method: 'POST',
      headers: { cookie: cookie! },
      body: form,
    });
    expect(response.status).toBe(201);
    const uploaded: UploadFileResponse = await response.json();
    const fileId = uploaded.fileId;

    const stored = await s3.admin.send(new GetObjectCommand({ Bucket: s3.config.bucket, Key: fileId }));
    expect(Buffer.from(await stored.Body!.transformToByteArray()).equals(PNG)).toBe(true);
    const file = await fetch(`${t.baseUrl}/api/files/${fileId}`);
    expect([file.status, file.headers.get('content-type')]).toEqual([200, 'image/png']);
    expect(Buffer.from(await file.arrayBuffer()).equals(PNG)).toBe(true);

    // DB 행은 있는데 객체가 없으면 404 file_not_found(get이 null).
    await s3.admin.send(new DeleteObjectCommand({ Bucket: s3.config.bucket, Key: fileId }));
    const gone = await fetch(`${t.baseUrl}/api/files/${fileId}`);
    expect(gone.status).toBe(404);
    const goneBody: ApiError = await gone.json();
    expect(goneBody.code).toBe('file_not_found');
  });
});
