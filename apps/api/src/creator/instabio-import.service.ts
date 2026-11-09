import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CRELINK_LIMITS,
  type InstabioImportPreview,
  type InstabioImportResult,
  type SignupInAppKind,
} from '@crelink/shared';
import { Database } from '../database';
import { apiError } from '../common/http';
import { bodyObject, optionalBoolean, optionalText, requiredText } from '../common/input';
import { FilesService } from '../files/files.service';
import { SignupFunnelService } from '../telemetry/signup-funnel.service';
import { CreatorService } from './creator.service';
import { InstabioSource, unavailable } from './instabio-source';
import { LinksService } from './links.service';

@Injectable()
export class InstabioImportService {
  private readonly active = new Set<string>();

  constructor(
    private readonly source: InstabioSource,
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly links: LinksService,
    private readonly files: FilesService,
    private readonly funnel: SignupFunnelService,
  ) {}

  /** 워커 하나에서 계정당1개·전체4개까지 외부 가져오기를 허용합니다. DB 정합성은 별도 행 잠금으로 보장합니다. */
  private async bounded<T>(userId: string, task: () => Promise<T>): Promise<T> {
    if (this.active.has(userId) || this.active.size >= 4) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'import_busy',
        '다른 가져오기가 진행 중이에요. 잠시 뒤 다시 시도해 주세요.',
      );
    }
    this.active.add(userId);
    try {
      return await task();
    } finally {
      this.active.delete(userId);
    }
  }

  preview(userId: string, body: unknown): Promise<InstabioImportPreview> {
    return this.bounded(userId, () => this.source.preview(bodyObject(body).url));
  }

  apply(userId: string, body: unknown, inAppKind: SignupInAppKind = 'unknown'): Promise<InstabioImportResult> {
    return this.bounded(userId, () => this.save(userId, bodyObject(body), inAppKind));
  }

  private async save(
    userId: string,
    input: Record<string, unknown>,
    inAppKind: SignupInAppKind,
  ): Promise<InstabioImportResult> {
    if (!Array.isArray(input.links) || input.links.length > CRELINK_LIMITS.totalLinks) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '가져올 링크를 선택해 주세요.');
    }
    const replaceProfile = optionalBoolean(input.replaceProfile, '프로필 교체') ?? false;
    const selections = new Map<string, string>();
    for (const raw of input.links) {
      const item = bodyObject(raw);
      const id = requiredText(item.id, '원본 항목', 120);
      if (selections.has(id))
        throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '같은 항목을 두 번 선택할 수 없어요.');
      selections.set(id, requiredText(item.title, '링크 제목', CRELINK_LIMITS.linkTitleMax));
    }
    if (!selections.size && !replaceProfile)
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '가져올 항목을 선택해 주세요.');
    const preview = await this.source.preview(input.url);
    if (input.fingerprint !== preview.fingerprint) {
      throw apiError(
        HttpStatus.CONFLICT,
        'import_source_changed',
        '원본 내용이 바뀌었어요. 다시 미리보기한 뒤 가져와 주세요.',
      );
    }
    if ([...selections.keys()].some((id) => !preview.links.some((link) => link.id === id))) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '원본에 없는 항목이에요. 다시 미리보기해 주세요.');
    }
    const displayName = replaceProfile
      ? (optionalText(preview.profile.displayName, '표시 이름', CRELINK_LIMITS.displayNameMax) ?? null)
      : null;
    const bio = replaceProfile ? (optionalText(preview.profile.bio, '소개', CRELINK_LIMITS.bioMax) ?? null) : null;
    const expected = replaceProfile ? bodyObject(input.expectedProfile) : null;
    const current = await this.creator.links(this.database.pool, userId);
    const urls = new Set(current.map((link) => link.url));
    const selected = preview.links.filter((link) => selections.has(link.id));
    // 목적 주소를 방문하지 않고 문자열로만 중복을 판별합니다.
    const candidates = selected.filter((link) => {
      if (urls.has(link.url)) return false;
      urls.add(link.url);
      return true;
    });
    const limits = await this.creator.limits(this.database.pool, userId);
    if (limits.totalUsed + candidates.length > limits.totalMax) this.limitError();
    for (const link of candidates) {
      if (await this.creator.blockedDomainFor(this.database.pool, new URL(link.url).hostname)) {
        throw apiError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'link_domain_blocked',
          '운영 정책으로 차단된 도메인이라 추가할 수 없습니다.',
        );
      }
    }
    const imageUrls = [
      ...new Set(
        [...candidates.map((link) => link.imageUrl), ...(replaceProfile ? [preview.profile.avatarUrl] : [])].filter(
          (url): url is string => Boolean(url),
        ),
      ),
    ];
    const buffers = await this.downloadImages(imageUrls);
    const images = new Map<string, string>();
    for (const [url, buffer] of buffers) {
      images.set(url, (await this.files.uploadBytes(userId, buffer)).fileId);
    }
    // 링크·프로필은 한번에 커밋합니다. 준비된 업로드는 일반 ImageField 업로드와 동일하게 독립 파일입니다.
    let firstLink = false;
    const result = await this.database.transaction(async (client) => {
      await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (expected) {
        const landing = await client.query<{
          display_name: string | null;
          bio: string | null;
          avatar_file_id: string | null;
        }>('SELECT display_name, bio, avatar_file_id FROM landings WHERE user_id = $1 FOR UPDATE', [userId]);
        const row = landing.rows[0];
        if (
          !row ||
          row.display_name !== expected.displayName ||
          row.bio !== expected.bio ||
          row.avatar_file_id !== expected.avatarFileId
        ) {
          throw apiError(
            HttpStatus.CONFLICT,
            'import_profile_changed',
            '프로필이 다른 곳에서 바뀌었어요. 화면을 새로 고친 뒤 다시 가져와 주세요.',
          );
        }
      }
      const latest = new Set((await this.creator.links(client, userId)).map((link) => link.url));
      const toAdd = candidates.filter((link) => !latest.has(link.url));
      const latestLimits = await this.creator.limits(client, userId);
      if (latestLimits.totalUsed + toAdd.length > latestLimits.totalMax) this.limitError();
      const added = [];
      for (const link of toAdd) {
        added.push(
          await this.links.createInTransaction(client, userId, {
            title: selections.get(link.id),
            url: link.url,
            thumbnailFileId: link.imageUrl ? images.get(link.imageUrl) : null,
          }),
        );
      }
      let profile: InstabioImportResult['profile'] = null;
      if (replaceProfile) {
        const avatarFileId = preview.profile.avatarUrl ? (images.get(preview.profile.avatarUrl) ?? null) : null;
        await this.files.ownedFileId(client, userId, avatarFileId);
        await client.query(
          'UPDATE landings SET display_name = $2, bio = $3, avatar_file_id = $4, updated_at = now() WHERE user_id = $1',
          [userId, displayName, bio, avatarFileId],
        );
        profile = { displayName, bio, avatar: this.files.imageRef(avatarFileId) };
      }
      firstLink = latest.size === 0 && added.length > 0;
      return { links: added, skipped: selected.length - added.length, profile };
    });
    if (firstLink) this.funnel.firstLink(userId, inAppKind);
    return result;
  }

  private limitError(): never {
    throw apiError(
      HttpStatus.CONFLICT,
      'link_total_limit_reached',
      '가져올 링크와 기존 링크를 합해 50개까지 둘 수 있어요. 가져올 항목을 줄여 주세요.',
    );
  }

  private async downloadImages(urls: string[]): Promise<Map<string, Buffer>> {
    const result = new Map<string, Buffer>();
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]);
    let next = 0;
    let total = 0;
    const workers = Array.from({ length: Math.min(3, urls.length) }, async () => {
      try {
        while (next < urls.length) {
          const url = urls[next++];
          const bytes = await this.source.read(url, CRELINK_LIMITS.imageMaxBytes, signal);
          total += bytes.length;
          if (total > 32 * 1024 * 1024) throw unavailable();
          result.set(url, bytes);
        }
      } catch (error) {
        abort.abort();
        throw error;
      }
    });
    const settled = await Promise.allSettled(workers);
    const failure = settled.find((item) => item.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return result;
  }
}
