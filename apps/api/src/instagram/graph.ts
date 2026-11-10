import { Injectable, Logger } from '@nestjs/common';

/** Graph API 버전. env로 만들지 않습니다(docs/specs/instagram-comment-dm.md#구성과-전제). */
export const GRAPH_API_VERSION = 'v27.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const LOGIN_DIALOG_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

/** 호출 한 건의 타임아웃. 발송 worker의 종료 유예(최악 10초)와 맞춥니다. */
export const GRAPH_REQUEST_TIMEOUT_MS = 10_000;
/** `GET /api/me/instagram/media` 한 페이지. */
export const GRAPH_MEDIA_PAGE_SIZE = 25;

/**
 * 로그와 호출자에게 넘겨도 되는 오류 코드·서브코드. 설계의 오류 분류표에 적힌 값뿐이고, 목록 밖의 값은 null로 버립니다.
 * `[M?]` 메시지 접근 꺼짐·정책 제재 코드는 S8 실측 뒤 이 목록에 더합니다.
 */
export const GRAPH_ALLOWED_ERROR_CODES: ReadonlySet<number> = new Set([190, 613, 80002]);
export const GRAPH_ALLOWED_ERROR_SUBCODES: ReadonlySet<number> = new Set([2534040]);

/** 토큰 무효. `[M?]` 190 계열의 범위는 S8로 확정합니다. */
const TOKEN_INVALID_CODE = 190;

/** 요청이 서버에 닿기 전에 실패한 오류(발송도 일어나지 않음). */
const CONNECT_FAILURE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * - `connect_failed`: 요청이 서버에 닿기 전 실패. 재시도할 수 있습니다.
 * - `indeterminate`: 타임아웃·5xx·응답 전 끊김·형식이 틀린 응답. 결과를 모르므로 발송은 재시도하지 않습니다.
 * - `rejected`: Graph가 4xx로 거절했습니다.
 */
export type GraphFailureKind = 'connect_failed' | 'indeterminate' | 'rejected';

/**
 * Graph 호출 실패. 원문(`message`, `error_user_msg`, `fbtrace_id`, 응답 본문, 원인 오류)은 토큰이나 사용자 정보가 섞일 수 있어
 * 담지 않고, 종류·HTTP 상태와 허용된 코드·서브코드만 남깁니다. `cause`도 넣지 않습니다.
 */
export class InstagramGraphError extends Error {
  constructor(
    readonly operation: string,
    readonly kind: GraphFailureKind,
    readonly status: number | null,
    readonly code: number | null,
    readonly subcode: number | null,
    /** `X-Business-Use-Case-Usage`의 대기 시간(초). 값이 없으면 null이고 worker가 1시간으로 둡니다. */
    readonly retryAfterSeconds: number | null,
  ) {
    super(`Graph ${operation} 실패: kind=${kind} status=${status} code=${code} subcode=${subcode}`);
    this.name = 'InstagramGraphError';
  }
}

/** 토큰 무효 오류인지 봅니다. `[M?]` 코드는 S8로 확정합니다. */
export function isGraphTokenInvalid(error: unknown): boolean {
  return error instanceof InstagramGraphError && error.kind === 'rejected' && error.code === TOKEN_INVALID_CODE;
}

export interface InstagramGraphConfig {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
}

export interface GraphAccessToken {
  accessToken: string;
  /** null이면 무기한으로 처리합니다. */
  expiresAt: Date | null;
}

export interface GraphInstagramAccount {
  igUserId: string;
  username: string;
  isProfessional: boolean;
}

export interface GraphAccountLookup {
  /** 데이터 삭제 콜백의 `user_id` 대조용(S9). */
  metaUserId: string | null;
  accounts: GraphInstagramAccount[];
}

export interface GraphMedia {
  id: string;
  caption: string;
  permalink: string;
  thumbnailUrl: string | null;
  timestamp: string;
  /** `[M?]` 캐러셀 처리는 S5 결과로 정합니다. */
  mediaType: string | null;
  childIds: string[];
}

export interface GraphMediaPage {
  items: GraphMedia[];
  nextCursor: string | null;
}

export interface GraphSentMessage {
  /** 200이면 발송 성공입니다. 본문을 읽지 못해도 성공이며 그때 null입니다. */
  messageId: string | null;
}

/**
 * Graph API 경계. `GoogleOAuth`처럼 통합 시험은 이 provider만 교체(또는 메서드 spy)해 실제 Meta 호출 없이 흐름을 검증합니다.
 * 실패는 모두 `InstagramGraphError`입니다.
 */
export abstract class InstagramGraph {
  /** Facebook Login 동의 URL. `[M?]` 엔드포인트와 파라미터는 S7로 확정합니다. */
  abstract authorizationUrl(config: InstagramGraphConfig, state: string): string;
  /** authorization code를 토큰으로 바꿉니다. `[M?]` S7. */
  abstract exchangeCode(config: InstagramGraphConfig, code: string): Promise<GraphAccessToken>;
  /** 토큰으로 볼 수 있는 Instagram 계정. 1개가 아니면 호출자가 409입니다. `[M?]` S7. */
  abstract fetchAccounts(accessToken: string): Promise<GraphAccountLookup>;
  /** `POST /<IG_ID>/subscribed_apps?subscribed_fields=comments`. */
  abstract subscribeApp(accessToken: string, igUserId: string): Promise<void>;
  /** 구독 해제. `[M?]` 경로는 미실측입니다. */
  abstract unsubscribeApp(accessToken: string, igUserId: string): Promise<void>;
  /** 게시물 목록(25건). `after`는 이전 페이지의 `nextCursor`입니다. */
  abstract listMedia(accessToken: string, igUserId: string, after: string | null): Promise<GraphMediaPage>;
  /** 댓글에 비공개 답장을 보냅니다. `text`는 발송 행의 `message_body`입니다. `[M?]` S3. */
  abstract sendPrivateReply(
    accessToken: string,
    igUserId: string,
    commentId: string,
    text: string,
  ): Promise<GraphSentMessage>;
  /** `GET /<IG_ID>?fields=id`. 토큰이 무효이면 `invalid`이고, 그 밖의 실패는 예외입니다. */
  abstract checkToken(accessToken: string, igUserId: string): Promise<'valid' | 'invalid'>;
}

/** `X-Business-Use-Case-Usage`의 대기 시간 중 가장 긴 값을 초로 돌려줍니다. `[M?]` 헤더 형식은 S8로 확정합니다. */
export function businessUseCaseWaitSeconds(header: string | null): number | null {
  if (!header) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const minutes = Object.values(parsed)
    .flatMap((entries: unknown) => (Array.isArray(entries) ? entries : []))
    .map((entry: { estimated_time_to_regain_access?: unknown }) => entry?.estimated_time_to_regain_access)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return minutes.length ? Math.max(...minutes) * 60 : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function allowed(value: unknown, list: ReadonlySet<number>): number | null {
  return typeof value === 'number' && list.has(value) ? value : null;
}

interface GraphRequest {
  method: 'GET' | 'POST' | 'DELETE';
  /** `[M?]` 토큰은 URL에 넣지 않고 Authorization 헤더로 보냅니다. 헤더 인증 지원은 미실측입니다. */
  accessToken?: string;
  query?: Record<string, string>;
  form?: Record<string, string>;
  json?: unknown;
}

@Injectable()
export class FetchInstagramGraph extends InstagramGraph {
  private readonly logger = new Logger(FetchInstagramGraph.name);

  authorizationUrl(config: InstagramGraphConfig, state: string): string {
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      config_id: config.loginConfigId,
      response_type: 'code',
      state,
    });
    return `${LOGIN_DIALOG_URL}?${params}`;
  }

  async exchangeCode(config: InstagramGraphConfig, code: string): Promise<GraphAccessToken> {
    // `[M?]` code·client_secret이 URL에 남지 않게 폼 본문으로 보냅니다. POST 지원은 S7로 확인합니다.
    const body = record(
      await this.request('exchangeCode', '/oauth/access_token', {
        method: 'POST',
        form: {
          client_id: config.appId,
          client_secret: config.appSecret,
          redirect_uri: config.redirectUri,
          code,
        },
      }),
    );
    const accessToken = text(body.access_token);
    if (!accessToken) throw this.malformed('exchangeCode');
    const expiresIn = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : null;
    return { accessToken, expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000) };
  }

  async fetchAccounts(accessToken: string): Promise<GraphAccountLookup> {
    // `[M?]` Facebook Login for Business의 계정 조회 형식은 S7로 확정합니다.
    const body = record(
      await this.request('fetchAccounts', '/me', {
        method: 'GET',
        accessToken,
        query: { fields: 'id,accounts{instagram_business_account{id,username}}' },
      }),
    );
    const pages = record(body.accounts).data;
    const accounts = (Array.isArray(pages) ? pages : []).flatMap((page): GraphInstagramAccount[] => {
      const account = record(record(page).instagram_business_account);
      const igUserId = text(account.id);
      const username = text(account.username);
      // `[M?]` instagram_business_account는 프로페셔널 계정에만 있다고 가정합니다. S7로 확인합니다.
      return igUserId && username ? [{ igUserId, username, isProfessional: true }] : [];
    });
    return { metaUserId: text(body.id), accounts };
  }

  async subscribeApp(accessToken: string, igUserId: string): Promise<void> {
    await this.request('subscribeApp', `/${encodeURIComponent(igUserId)}/subscribed_apps`, {
      method: 'POST',
      accessToken,
      query: { subscribed_fields: 'comments' },
    });
  }

  async unsubscribeApp(accessToken: string, igUserId: string): Promise<void> {
    // `[M?]` DELETE /<IG_ID>/subscribed_apps는 미실측입니다.
    await this.request('unsubscribeApp', `/${encodeURIComponent(igUserId)}/subscribed_apps`, {
      method: 'DELETE',
      accessToken,
    });
  }

  async listMedia(accessToken: string, igUserId: string, after: string | null): Promise<GraphMediaPage> {
    const body = record(
      await this.request('listMedia', `/${encodeURIComponent(igUserId)}/media`, {
        method: 'GET',
        accessToken,
        query: {
          // `[M?]` children은 캐러셀 처리(S5)용입니다.
          fields: 'id,caption,permalink,thumbnail_url,media_url,timestamp,media_type,children{id}',
          limit: String(GRAPH_MEDIA_PAGE_SIZE),
          ...(after ? { after } : {}),
        },
      }),
    );
    if (!Array.isArray(body.data)) throw this.malformed('listMedia');
    const items = body.data.flatMap((value): GraphMedia[] => {
      const media = record(value);
      const id = text(media.id);
      const permalink = text(media.permalink);
      const timestamp = text(media.timestamp);
      if (!id || !permalink || !timestamp) return [];
      const children = record(media.children).data;
      return [
        {
          id,
          caption: text(media.caption) ?? '',
          permalink,
          thumbnailUrl: text(media.thumbnail_url) ?? text(media.media_url),
          timestamp,
          mediaType: text(media.media_type),
          childIds: (Array.isArray(children) ? children : []).flatMap((child) => text(record(child).id) ?? []),
        },
      ];
    });
    const paging = record(body.paging);
    return { items, nextCursor: paging.next ? text(record(paging.cursors).after) : null };
  }

  async sendPrivateReply(
    accessToken: string,
    igUserId: string,
    commentId: string,
    message: string,
  ): Promise<GraphSentMessage> {
    // `[M?]` 호출 형식은 S3, 메시지 길이 단위는 S11로 확정합니다.
    const body = record(
      await this.request('sendPrivateReply', `/${encodeURIComponent(igUserId)}/messages`, {
        method: 'POST',
        accessToken,
        json: { recipient: { comment_id: commentId }, message: { text: message } },
      }),
    );
    return { messageId: text(body.message_id) };
  }

  async checkToken(accessToken: string, igUserId: string): Promise<'valid' | 'invalid'> {
    try {
      await this.request('checkToken', `/${encodeURIComponent(igUserId)}`, {
        method: 'GET',
        accessToken,
        query: { fields: 'id' },
      });
      return 'valid';
    } catch (error) {
      if (isGraphTokenInvalid(error)) return 'invalid';
      throw error;
    }
  }

  /** 2xx면 본문 JSON(읽지 못하면 null)을 돌려주고, 그 밖에는 원문을 버린 `InstagramGraphError`를 던집니다. */
  private async request(operation: string, path: string, request: GraphRequest): Promise<unknown> {
    const query = request.query ? `?${new URLSearchParams(request.query)}` : '';
    const headers: Record<string, string> = {};
    if (request.accessToken) headers.authorization = `Bearer ${request.accessToken}`;
    let body: string | undefined;
    if (request.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(request.form).toString();
    } else if (request.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(request.json);
    }
    let response: Response;
    try {
      response = await fetch(`${GRAPH_API_BASE}${path}${query}`, {
        method: request.method,
        headers,
        body,
        signal: AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const cause = record(record(error).cause);
      const connectFailed = typeof cause.code === 'string' && CONNECT_FAILURE_CODES.has(cause.code);
      throw this.failure(operation, connectFailed ? 'connect_failed' : 'indeterminate', null, null, null, null);
    }
    const payload = await response.text().catch(() => '');
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // 2xx 본문은 호출별로 검사하고, 오류 본문은 코드 없이 처리합니다.
    }
    if (response.ok) return parsed;
    const error = record(record(parsed).error);
    throw this.failure(
      operation,
      response.status >= 500 ? 'indeterminate' : 'rejected',
      response.status,
      allowed(error.code, GRAPH_ALLOWED_ERROR_CODES),
      allowed(error.error_subcode, GRAPH_ALLOWED_ERROR_SUBCODES),
      businessUseCaseWaitSeconds(response.headers.get('x-business-use-case-usage')),
    );
  }

  private malformed(operation: string): InstagramGraphError {
    return this.failure(operation, 'indeterminate', null, null, null, null);
  }

  private failure(
    operation: string,
    kind: GraphFailureKind,
    status: number | null,
    code: number | null,
    subcode: number | null,
    retryAfterSeconds: number | null,
  ): InstagramGraphError {
    const error = new InstagramGraphError(operation, kind, status, code, subcode, retryAfterSeconds);
    this.logger.warn(error.message);
    return error;
  }
}
