import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PageContext } from '@crelink/shared';
import { AuthenticatedRequest } from '../auth/actor';
import { Database } from '../database';
import { apiError } from '../common/http';

const OWNER_ONLY = 'crelink:pageOwnerOnly';
export const PageOwnerOnly = () => SetMetadata(OWNER_ONLY, true);

@Injectable()
export class PageAccessGuard implements CanActivate {
  constructor(
    private readonly database: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.sessionUser;
    if (!user) throw new Error('PageAccessGuard는 SessionGuard 뒤에서만 씁니다.');
    const header = request.headers['x-crelink-page'];
    let page: PageContext = { ownerUserId: user.id, role: 'owner', publicId: null, shared: false };
    if (header !== undefined) {
      if (request.actor?.kind === 'ai') throw apiError(403, 'forbidden', 'AI는 페이지 헤더를 사용할 수 없습니다.');
      if (typeof header !== 'string' || !/^[a-z0-9]{10}$/.test(header)) {
        throw apiError(404, 'page_not_found', '페이지를 찾을 수 없습니다.');
      }
      const result = await this.database.query<{
        user_id: string;
        public_id: string;
        suspended: boolean;
        member: boolean;
        shared: boolean;
      }>(
        `SELECT l.user_id, l.public_id, u.suspended_at IS NOT NULL AS suspended,
        EXISTS(SELECT 1 FROM page_members WHERE page_user_id=l.user_id AND member_user_id=$2) AS member,
        EXISTS(SELECT 1 FROM page_members WHERE page_user_id=l.user_id) AS shared
        FROM landings l JOIN users u ON u.id=l.user_id WHERE l.public_id=$1 AND u.kind='human'`,
        [header, user.id],
      );
      const row = result.rows[0];
      if (!row || (row.user_id !== user.id && !row.member))
        throw apiError(404, 'page_not_found', '페이지를 찾을 수 없습니다.');
      if (row.user_id !== user.id && row.suspended) throw apiError(403, 'page_suspended', '정지된 페이지입니다.');
      page = {
        ownerUserId: row.user_id,
        publicId: row.public_id,
        role: row.user_id === user.id ? 'owner' : 'editor',
        shared: row.shared,
      };
    }
    if (
      page.role === 'editor' &&
      this.reflector.getAllAndOverride<boolean>(OWNER_ONLY, [context.getHandler(), context.getClass()])
    ) {
      throw apiError(403, 'page_owner_only', '페이지 소유자만 사용할 수 있습니다.');
    }
    request.pageContext = page;
    return true;
  }
}

export const CurrentPage = createParamDecorator((_data: unknown, context: ExecutionContext): PageContext => {
  const page = context.switchToHttp().getRequest<AuthenticatedRequest>().pageContext;
  if (!page) throw new Error('CurrentPage는 PageAccessGuard 뒤에서만 씁니다.');
  return page;
});
