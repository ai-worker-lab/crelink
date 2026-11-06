// API 프로세스 전용 외부 원본 fixture. 내부 HTTP/API/PostgreSQL은 대체하지 않습니다.
import process from 'node:process';
import { URL } from 'node:url';
import { assertLocalE2ETargets } from '../../scripts/lib/e2e-local.mjs';

if (process.env.CRELINK_E2E_INSTABIO === '1') {
  assertLocalE2ETargets(process.env);
  const originalFetch = globalThis.fetch;
  const id = 'CrelinkE2E0200';
  const html = `<script>window.__data=${JSON.stringify({ state: 1, ui: { state: 1, title: '가져온 프로필', desc: '합성 원본 소개' }, bio: { id } })};</script>`;
  const source = {
    linkid: id,
    cmpts: JSON.stringify([
      {
        id: 'buttons',
        state: 1,
        subtype: 'cmpt-button-buttonLink',
        links: [
          {
            id: 1,
            title: '가져온 작업',
            link: 'https://import.e2e.test/work?affiliate=keep',
            state: 1,
            type: 1,
            order: 1,
          },
          { id: 2, title: '기존 작업 중복', link: 'https://import.e2e.test/existing', state: 1, type: 1, order: 2 },
        ],
      },
    ]),
    orders: '["buttons"]',
    pages: [],
  };
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === `https://instabio.cc/${id}`) return Promise.resolve(new globalThis.Response(html));
    if (url === `https://bio.linkcdn.cc/upload/lnkcmpts/${id}.json`)
      return Promise.resolve(globalThis.Response.json(source));
    return originalFetch(input, init);
  };
}
