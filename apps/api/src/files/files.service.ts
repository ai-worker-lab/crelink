import { HttpStatus, Injectable } from '@nestjs/common';
import { CRELINK_API_PATHS, CRELINK_LIMITS, ImageRef, UploadFileResponse } from '@crelink/shared';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config.service';
import { Database, Queryable } from '../database';
import { apiError, UUID_PATTERN } from '../common/http';
import { isAnimatedImage } from './animated-image';
import { FileStorage } from './file-storage';

/** 이미지 한도 초과 안내. 한도는 계약 상수(`CRELINK_LIMITS.imageMaxBytes`)에서 계산합니다. */
export const IMAGE_TOO_LARGE_MESSAGE = `이미지는 ${CRELINK_LIMITS.imageMaxBytes / (1024 * 1024)}MB 이하만 올릴 수 있습니다.`;

/** 파일 앞부분(매직 바이트)으로 이미지 형식을 판단합니다. 클라이언트가 보낸 Content-Type은 믿지 않습니다. */
function detectImageType(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const head = data.subarray(0, 12).toString('latin1');
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly database: Database,
    private readonly storage: FileStorage,
    private readonly config: AppConfig,
  ) {}

  /** 브라우저가 쓰는 이미지 주소. 웹 BFF가 API `GET /api/files/{id}`를 그대로 전달합니다. */
  imageUrl(fileId: string): string {
    return `${this.config.webUrl}/api/backend${CRELINK_API_PATHS.file(fileId)}`;
  }

  imageRef(fileId: string | null): ImageRef | null {
    return fileId ? { fileId, url: this.imageUrl(fileId) } : null;
  }

  /** 업로드 때 형식과 움직임(GIF·WebP·APNG, `files.animated`)을 판정해 저장합니다. */
  async upload(userId: string, file: Express.Multer.File | undefined): Promise<UploadFileResponse> {
    if (!file) throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '업로드할 이미지 파일(file)을 보내 주세요.');
    if (file.size > CRELINK_LIMITS.imageMaxBytes) {
      throw apiError(HttpStatus.BAD_REQUEST, 'file_too_large', IMAGE_TOO_LARGE_MESSAGE);
    }
    const contentType = detectImageType(file.buffer);
    if (!contentType) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'file_type_unsupported',
        'JPEG, PNG, WebP, GIF 이미지만 올릴 수 있습니다.',
      );
    }
    const animated = isAnimatedImage(contentType, file.buffer);
    const id = randomUUID();
    await this.storage.put(id, file.buffer);
    await this.database.query(
      'INSERT INTO files (id, owner_user_id, storage_key, content_type, size, animated) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, userId, id, contentType, file.size, animated],
    );
    return { fileId: id, url: this.imageUrl(id), animated };
  }

  /**
   * 파일이 움직이는 이미지인지. `files.animated`가 NULL(0003 전에 올린 파일)이면 저장소에서 바이트를 읽어 판정하고 채웁니다.
   * 배너 저장(정지 이미지 규칙)에서 씁니다. 파일 행이나 저장소 객체가 없으면 404 `file_not_found`.
   */
  async isAnimated(db: Queryable, fileId: string): Promise<boolean> {
    const notFound = apiError(HttpStatus.NOT_FOUND, 'file_not_found', '이미지를 찾을 수 없습니다. 다시 올려 주세요.');
    if (!UUID_PATTERN.test(fileId)) throw notFound;
    const file = await db.query<{ storage_key: string; content_type: string; animated: boolean | null }>(
      'SELECT storage_key, content_type, animated FROM files WHERE id = $1',
      [fileId],
    );
    const row = file.rows[0];
    if (!row) throw notFound;
    if (row.animated !== null) return row.animated;
    const data = await this.storage.get(row.storage_key);
    if (!data) throw notFound;
    const animated = isAnimatedImage(row.content_type, data);
    await db.query('UPDATE files SET animated = $2 WHERE id = $1 AND animated IS NULL', [fileId, animated]);
    return animated;
  }

  async read(fileId: string): Promise<{ contentType: string; data: Buffer } | null> {
    if (!UUID_PATTERN.test(fileId)) return null;
    const file = await this.database.query<{ storage_key: string; content_type: string }>(
      'SELECT storage_key, content_type FROM files WHERE id = $1',
      [fileId],
    );
    if (!file.rowCount) return null;
    const data = await this.storage.get(file.rows[0].storage_key);
    return data ? { contentType: file.rows[0].content_type, data } : null;
  }

  /**
   * 요청의 이미지 id 필드. undefined는 "바꾸지 않음", null은 "비움", 그 밖에는 본인이 올린 파일이어야 합니다(아니면 404 `file_not_found`).
   */
  async ownedFileId(db: Queryable, userId: string, value: unknown): Promise<string | null | undefined> {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string' && UUID_PATTERN.test(value)) {
      const owned = await db.query('SELECT 1 FROM files WHERE id = $1 AND owner_user_id = $2', [value, userId]);
      if (owned.rowCount) return value;
    }
    throw apiError(HttpStatus.NOT_FOUND, 'file_not_found', '이미지를 찾을 수 없습니다. 다시 올려 주세요.');
  }
}
