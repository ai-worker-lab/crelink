import { HttpStatus, Injectable } from '@nestjs/common';
import { CRELINK_LIMITS, GuestbookEntryView, GuestbookPage, SessionUser } from '@crelink/shared';
import { Database } from '../database';
import { apiError, UUID_PATTERN } from '../common/http';
import { cursorAtSql, cursorBeforeSql, cursorPage, parseCursor } from '../common/cursor';
import { bodyObject, optionalBoolean, requiredText } from '../common/input';
import { CreatorService, PublicLandingRow } from '../creator/creator.service';
import { FilesService } from '../files/files.service';

interface EntryRow {
  id: string;
  body: string;
  is_secret: boolean;
  hidden: boolean;
  author_user_id: string;
  created_at: Date;
  /** created_at의 epoch 마이크로초(커서용, `cursorAtSql`). */
  cursor_at: string;
  author_display_name: string | null;
  author_avatar_file_id: string | null;
}

/** `e`(guestbook_entries 행)에서 EntryRow를 읽는 컬럼과 조인. 작성자 이름·사진은 작성자 랜딩의 현재 값입니다. */
const ENTRY_SELECT = `
  SELECT e.id, e.body, e.is_secret, e.hidden_at IS NOT NULL AS hidden, e.author_user_id, e.created_at,
         ${cursorAtSql('e.created_at')} AS cursor_at,
         al.display_name AS author_display_name, al.avatar_file_id AS author_avatar_file_id
  FROM e JOIN users au ON au.id = e.author_user_id LEFT JOIN landings al ON al.user_id = e.author_user_id`;

function entryNotFound() {
  return apiError(HttpStatus.NOT_FOUND, 'guestbook_entry_not_found', '방명록 글을 찾을 수 없습니다.');
}

/**
 * 랜딩 방명록(R19). 가시성: 작성자가 정지된 글은 모두에게 빼고, 그 밖에는 보는 사람이 작성자이거나 랜딩 크리에이터이거나
 * 공개·숨기지 않은 글이면 보입니다. 숨김 여부(`hidden`)는 랜딩 크리에이터에게만 알립니다.
 * 근거: docs/specs/crelink-guestbook.md (데이터 모델, API 계약 초안)
 */
@Injectable()
export class GuestbookService {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
  ) {}

  async list(publicId: string, viewer: SessionUser | null, cursorValue: unknown): Promise<GuestbookPage> {
    const landing = await this.openLanding(publicId);
    const cursor = parseCursor(cursorValue, '방명록 목록 위치가 올바르지 않습니다. 처음부터 다시 불러와 주세요.');
    const viewerId = viewer?.id ?? null;
    const isOwner = viewerId === landing.user_id;
    const pageSize = CRELINK_LIMITS.guestbookPageSize;
    const result = await this.database.query<EntryRow>(
      `WITH e AS (
         SELECT * FROM guestbook_entries
         WHERE landing_id = $1
           AND (author_user_id = $2 OR $3::boolean OR (NOT is_secret AND hidden_at IS NULL))
           AND ${cursorBeforeSql('created_at', 'id', 4, 5)}
       )
       ${ENTRY_SELECT}
       WHERE au.suspended_at IS NULL
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $6`,
      [landing.id, viewerId, isOwner, cursor?.at ?? null, cursor?.id ?? null, pageSize + 1],
    );
    const { items, nextCursor } = cursorPage(result.rows, pageSize, (row) => this.view(row, viewerId, isOwner));
    return { entries: items, nextCursor, viewer: { signedIn: viewer !== null, isOwner } };
  }

  async create(publicId: string, user: SessionUser, body: unknown): Promise<GuestbookEntryView> {
    const landing = await this.openLanding(publicId);
    const input = bodyObject(body);
    const text = requiredText(input.body, '방명록 내용', CRELINK_LIMITS.guestbookBodyMax);
    const secret = optionalBoolean(input.secret, '비밀글') ?? false;
    const result = await this.database.query<EntryRow>(
      `WITH e AS (
         INSERT INTO guestbook_entries (landing_id, author_user_id, body, is_secret) VALUES ($1, $2, $3, $4) RETURNING *
       )
       ${ENTRY_SELECT}`,
      [landing.id, user.id, text, secret],
    );
    return this.view(result.rows[0], user.id, user.id === landing.user_id);
  }

  /** 작성자만 지웁니다. 없거나 내 글이 아니면 404 `guestbook_entry_not_found`. */
  async remove(entryId: string, user: SessionUser): Promise<void> {
    if (!UUID_PATTERN.test(entryId)) throw entryNotFound();
    const result = await this.database.query('DELETE FROM guestbook_entries WHERE id = $1 AND author_user_id = $2', [
      entryId,
      user.id,
    ]);
    if (!result.rowCount) throw entryNotFound();
  }

  /** 랜딩 크리에이터만 숨기고 풉니다. 없거나 내 랜딩 글이 아니면 404 `guestbook_entry_not_found`. */
  async setHidden(entryId: string, user: SessionUser, body: unknown): Promise<GuestbookEntryView> {
    if (!UUID_PATTERN.test(entryId)) throw entryNotFound();
    const hidden = optionalBoolean(bodyObject(body).hidden, '숨김(hidden)');
    if (hidden === undefined) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '숨김(hidden)을 true 또는 false로 보내 주세요.');
    }
    const result = await this.database.query<EntryRow>(
      `WITH e AS (
         UPDATE guestbook_entries g SET hidden_at = CASE WHEN $3::boolean THEN now() END
         FROM landings l
         WHERE g.id = $1 AND l.id = g.landing_id AND l.user_id = $2
         RETURNING g.*
       )
       ${ENTRY_SELECT}`,
      [entryId, user.id, hidden],
    );
    if (!result.rowCount) throw entryNotFound();
    return this.view(result.rows[0], user.id, true);
  }

  /** 공개 랜딩 판정(404·410) 뒤 방명록이 꺼져 있으면 404 `guestbook_disabled`. */
  private async openLanding(publicId: string): Promise<PublicLandingRow> {
    const landing = await this.creator.publicLanding(this.database.pool, publicId);
    if (!landing.guestbook_enabled) {
      throw apiError(HttpStatus.NOT_FOUND, 'guestbook_disabled', '방명록을 닫은 페이지입니다.');
    }
    return landing;
  }

  private view(row: EntryRow, viewerId: string | null, isOwner: boolean): GuestbookEntryView {
    return {
      id: row.id,
      body: row.body,
      secret: row.is_secret,
      hidden: isOwner && row.hidden,
      mine: row.author_user_id === viewerId,
      author: {
        displayName: row.author_display_name,
        avatarUrl: row.author_avatar_file_id ? this.files.imageUrl(row.author_avatar_file_id) : null,
      },
      createdAt: row.created_at.toISOString(),
    };
  }
}
