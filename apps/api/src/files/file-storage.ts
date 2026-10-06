import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfig } from '../config.service';

/**
 * 이미지 바이트 저장소. `FILE_STORAGE`(기본 `disk`)로 FilesModule이 구현을 고릅니다:
 * `LocalDiskFileStorage`(아래) 또는 `S3FileStorage`(`s3-file-storage.ts`). 계약 시험: test/file-storage.e2e-spec.ts
 */
export abstract class FileStorage {
  /** key는 API가 만든 UUID입니다. 같은 key가 있으면 실패합니다. */
  abstract put(key: string, data: Buffer): Promise<void>;
  /** 없으면 null. */
  abstract get(key: string): Promise<Buffer | null>;
}

/** `FILE_STORAGE=disk`: `UPLOAD_DIR`(기본 저장소 루트 `.local/uploads`)에 key 이름 파일로 저장합니다. */
export class LocalDiskFileStorage extends FileStorage {
  constructor(private readonly config: AppConfig) {
    super();
  }

  async put(key: string, data: Buffer): Promise<void> {
    const directory = this.config.uploadDir;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, key), data, { flag: 'wx' });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.config.uploadDir, key));
    } catch (error) {
      // fs 오류는 jest 등 다른 realm에서 `instanceof Error`가 거짓일 수 있어 code만 봅니다.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
}
