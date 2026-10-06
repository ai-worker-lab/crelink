import { createTestApp, TestApp } from './test-app';

/**
 * 본문 파서(express body-parser)가 컨트롤러 전에 내는 오류도 `ApiError` 계약과 맞는 4xx로 응답한다.
 * 이 오류들은 Nest `HttpException`이 아니라 `status`가 붙은 http-errors라, 예전에는 500 `internal_error`가 됐다.
 */
describe('본문 파서 오류 응답', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  const post = (body: string, contentType = 'application/json') =>
    fetch(`${t.baseUrl}/api/me/links`, { method: 'POST', headers: { 'content-type': contentType }, body });

  it('JSON 본문이 한도(100KB)를 넘으면 413 validation_failed', async () => {
    const response = await post(JSON.stringify({ title: 'x'.repeat(110 * 1024) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: 'validation_failed', message: '요청 본문이 너무 큽니다.' });
  });

  it('JSON 문법이 틀리면 400 validation_failed', async () => {
    const response = await post('{"title":');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'validation_failed', message: '요청 형식이 올바르지 않습니다.' });
  });

  it('지원하지 않는 문자셋이면 415 validation_failed', async () => {
    const response = await post('{}', 'application/json; charset=klingon');
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      code: 'validation_failed',
      message: '지원하지 않는 요청 본문 형식입니다.',
    });
  });

  it('한도 안의 정상 본문은 파서를 지나 인증 검사(401)에 닿는다', async () => {
    const response = await post(JSON.stringify({ title: 'x'.repeat(90 * 1024) }));
    expect(response.status).toBe(401);
  });
});
