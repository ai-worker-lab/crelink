import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfig } from '../config.service';

/** 이미지 바이트 저장소. MVP는 로컬 디스크이며 원격 저장소로 바꿀 때 이 경계만 새로 구현합니다. */
export abstract class FileStorage {
  /** key는 API가 만든 UUID입니다. 같은 key가 있으면 실패합니다. */
  abstract put(key: string, data: Buffer): Promise<void>;
  /** 없으면 null. */
  abstract get(key: string): Promise<Buffer | null>;
}

/** `UPLOAD_DIR`(기본 저장소 루트 `.local/uploads`)에 key 이름 파일로 저장합니다. */
@Injectable()
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
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
}
