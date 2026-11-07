import { LANDING_EVENT_LIMITS } from '@crelink/shared';

const MAX_EVENT_BYTES = LANDING_EVENT_LIMITS.bodyBytes;

/** 작은 JSON 이벤트만 읽습니다. Content-Length가 없거나 거짓이어도 스트림에서 같은 한도를 적용합니다. */
export async function readVisitorEventBody(request: Request): Promise<string | Response> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return Response.json({ code: 'validation_failed', message: 'JSON 요청이 필요해요.' }, { status: 415 });
  }
  const declaredSize = Number(request.headers.get('content-length'));
  const tooLarge = () =>
    Response.json({ code: 'validation_failed', message: '이벤트 요청이 너무 커요.' }, { status: 413 });
  if (declaredSize > MAX_EVENT_BYTES) return tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_EVENT_BYTES) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return Response.json({ code: 'validation_failed', message: '이벤트 요청을 읽지 못했어요.' }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** 미등록 이탈 이벤트 하나만 원본 page_view의 실제204 뒤 전달합니다. API의 단일 이벤트 계약은 바꾸지 않습니다. */
export async function forwardVisitorEvent(body: string, send: (body: string) => Promise<Response>): Promise<Response> {
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return send(body);
  }
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!object(input) || !('pageView' in input)) return send(body);
  const { pageView, event } = input;
  if (
    Object.keys(input).some((key) => key !== 'pageView' && key !== 'event') ||
    !object(pageView) ||
    !object(event) ||
    pageView.type !== 'page_view' ||
    (event.type !== 'click' && event.type !== 'engagement') ||
    !['token', 'sessionId', 'pageViewId'].every(
      (key) => typeof pageView[key] === 'string' && pageView[key] === event[key],
    ) ||
    typeof pageView.eventId !== 'string' ||
    typeof event.eventId !== 'string' ||
    pageView.eventId.toLowerCase() === event.eventId.toLowerCase()
  ) {
    return Response.json(
      { code: 'validation_failed', message: '방문 이벤트 연결이 올바르지 않아요.' },
      { status: 400 },
    );
  }
  const registered = await send(JSON.stringify(pageView));
  if (registered.status !== 204) return registered;
  return send(JSON.stringify(event));
}
