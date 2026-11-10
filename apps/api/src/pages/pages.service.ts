import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ManagedPagesResponse, PageInvitePreview, PageMembersResponse } from '@crelink/shared';
import { Database, Queryable } from '../database';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject } from '../common/input';
import { FilesService } from '../files/files.service';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => apiError(404, 'invite_invalid', '유효하지 않은 초대입니다.');
interface InviteRow {
  page_user_id: string;
  public_id: string;
  display_name: string | null;
  avatar_file_id: string | null;
  expires_at: Date;
  suspended: boolean;
}

@Injectable()
export class PagesService {
  constructor(
    private readonly database: Database,
    private readonly files: FilesService,
  ) {}

  async pages(userId: string): Promise<ManagedPagesResponse> {
    const result = await this.database.query<{
      public_id: string;
      display_name: string | null;
      avatar_file_id: string | null;
      own: boolean;
      shared: boolean;
    }>(
      `SELECT l.public_id, l.display_name, l.avatar_file_id, l.user_id=$1 AS own,
       EXISTS(SELECT 1 FROM page_members WHERE page_user_id=l.user_id) AS shared
       FROM landings l JOIN users u ON u.id=l.user_id
       WHERE u.kind='human' AND u.suspended_at IS NULL AND (l.user_id=$1 OR EXISTS
         (SELECT 1 FROM page_members WHERE page_user_id=l.user_id AND member_user_id=$1))
       ORDER BY (l.user_id=$1) DESC, l.public_id`,
      [userId],
    );
    return {
      pages: result.rows.map((row) => ({
        publicId: row.public_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_file_id ? this.files.imageUrl(row.avatar_file_id) : null,
        access: row.own ? 'personal' : 'shared',
        role: row.own ? 'owner' : 'editor',
        hasMembers: row.shared,
      })),
    };
  }

  private async checkLimit(db: Queryable, ownerId: string) {
    const result = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM page_members WHERE page_user_id=$1',
      [ownerId],
    );
    if (result.rows[0].count >= 5) throw apiError(409, 'page_member_limit', '공동 관리자는 최대 5명입니다.');
  }

  async createInvite(ownerId: string) {
    return this.database.transaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [ownerId]);
      await this.checkLimit(client, ownerId);
      await client.query('DELETE FROM page_invites WHERE page_user_id=$1 AND used_at IS NULL', [ownerId]);
      const token = randomBytes(32).toString('base64url');
      const result = await client.query<{ expires_at: Date }>(
        `INSERT INTO page_invites(page_user_id,token_hash,expires_at)
        VALUES($1,$2,now()+interval '72 hours') RETURNING expires_at`,
        [ownerId, hash(token)],
      );
      return { token, expiresAt: result.rows[0].expires_at.toISOString() };
    });
  }

  async cancelInvite(ownerId: string) {
    await this.database.transaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [ownerId]);
      await client.query('DELETE FROM page_invites WHERE page_user_id=$1 AND used_at IS NULL', [ownerId]);
    });
  }

  async members(ownerId: string): Promise<PageMembersResponse> {
    const members = await this.database.query<{ user_id: string; email: string; created_at: Date }>(
      `SELECT u.id AS user_id,u.email,m.created_at FROM page_members m JOIN users u ON u.id=m.member_user_id
       WHERE page_user_id=$1 ORDER BY m.created_at,u.id`,
      [ownerId],
    );
    const invite = await this.database.query<{ expires_at: Date }>(
      'SELECT expires_at FROM page_invites WHERE page_user_id=$1 AND used_at IS NULL AND expires_at>now()',
      [ownerId],
    );
    return {
      members: members.rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        createdAt: row.created_at.toISOString(),
      })),
      invite: invite.rows[0] ? { expiresAt: invite.rows[0].expires_at.toISOString() } : null,
      limit: 5,
    };
  }

  async remove(ownerId: string, memberId: string) {
    if (!UUID_PATTERN.test(memberId)) throw apiError(404, 'member_not_found', '멤버를 찾을 수 없습니다.');
    const result = await this.database.query('DELETE FROM page_members WHERE page_user_id=$1 AND member_user_id=$2', [
      ownerId,
      memberId,
    ]);
    if (!result.rowCount) throw apiError(404, 'member_not_found', '멤버를 찾을 수 없습니다.');
  }

  private token(body: unknown) {
    const token = bodyObject(body).token;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
    return token;
  }

  private async invite(db: Queryable, token: string): Promise<InviteRow> {
    const result = await db.query<InviteRow>(
      `SELECT i.page_user_id,l.public_id,l.display_name,l.avatar_file_id,i.expires_at,
      u.suspended_at IS NOT NULL AS suspended FROM page_invites i JOIN users u ON u.id=i.page_user_id
      JOIN landings l ON l.user_id=i.page_user_id WHERE i.token_hash=$1 AND i.used_at IS NULL
      AND i.expires_at>now() AND u.kind='human'`,
      [hash(token)],
    );
    if (!result.rows[0]) throw invalid();
    return result.rows[0];
  }

  private async checkMember(db: Queryable, ownerId: string, userId: string) {
    if (ownerId === userId) throw apiError(409, 'invite_own_page', '본인 페이지의 초대입니다.');
    const result = await db.query('SELECT 1 FROM page_members WHERE page_user_id=$1 AND member_user_id=$2', [
      ownerId,
      userId,
    ]);
    if (result.rowCount) throw apiError(409, 'already_member', '이미 공동 관리자입니다.');
  }

  async preview(userId: string, body: unknown): Promise<PageInvitePreview> {
    const row = await this.invite(this.database.pool, this.token(body));
    await this.checkMember(this.database.pool, row.page_user_id, userId);
    return {
      publicId: row.public_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_file_id ? this.files.imageUrl(row.avatar_file_id) : null,
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async accept(userId: string, body: unknown) {
    const token = this.token(body);
    return this.database.transaction(async (client) => {
      const initial = await this.invite(client, token);
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [initial.page_user_id]);
      const row = await this.invite(client, token);
      if (row.suspended) throw apiError(403, 'page_suspended', '정지된 페이지입니다.');
      const consumed = await client.query(
        `UPDATE page_invites SET used_at=now(),used_by_user_id=$2
        WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING id`,
        [hash(token), userId],
      );
      if (!consumed.rowCount) throw invalid();
      await this.checkMember(client, row.page_user_id, userId);
      await this.checkLimit(client, row.page_user_id);
      await client.query('INSERT INTO page_members(page_user_id,member_user_id) VALUES($1,$2)', [
        row.page_user_id,
        userId,
      ]);
      return { publicId: row.public_id };
    });
  }
}
