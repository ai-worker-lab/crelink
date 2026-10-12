#!/usr/bin/env node
// 공개 sitemap의 주소를 IndexNow로 검색엔진(네이버·Bing 등)에 알립니다.
// 키는 `apps/web/public/<키>.txt`(파일 이름과 내용이 같은 파일)가 원본이며, 프로토콜상 누구나 읽는 공개 확인 값입니다.
// 사용: node scripts/indexnow.mjs [--site https://links.shaul.kr] [--dry-run]
// --dry-run은 sitemap·키 파일을 확인하고 보낼 내용만 출력합니다. 운영에 보내기 전 AI 운영자는 `guard`를 먼저 부릅니다.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'apps/web/public');
const DEFAULT_SITE = 'https://links.shaul.kr';
// api.indexnow.org는 참여 검색엔진 모두에 공유합니다. 국내 검색 비중 때문에 네이버에도 직접 보냅니다.
const ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow'];
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

function parseArgs(argv) {
  const args = { site: DEFAULT_SITE, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--site') args.site = argv[++i];
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  if (!args.site) throw new Error('--site 값이 비어 있습니다.');
  return args;
}

async function findKey() {
  const keys = [];
  for (const name of await readdir(PUBLIC_DIR)) {
    if (!name.endsWith('.txt')) continue;
    const key = name.slice(0, -'.txt'.length);
    if (!KEY_PATTERN.test(key)) continue;
    const content = (await readFile(path.join(PUBLIC_DIR, name), 'utf8')).trim();
    if (content === key) keys.push(key);
  }
  if (keys.length !== 1)
    throw new Error(`apps/web/public의 IndexNow 키 파일이 1개여야 합니다(찾은 수 ${keys.length}).`);
  return keys[0];
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'manual' });
  if (res.status !== 200) throw new Error(`${url} 응답 ${res.status}`);
  return res.text();
}

function sitemapUrls(xml) {
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error('sitemap에 주소가 없습니다.');
  const hosts = new Set(urls.map((url) => new URL(url).host));
  if (hosts.size !== 1) throw new Error(`sitemap 주소의 호스트가 하나가 아닙니다: ${[...hosts].join(', ')}`);
  return { host: [...hosts][0], urls };
}

async function main() {
  const { site, dryRun } = parseArgs(process.argv.slice(2));
  const origin = new URL(site).origin;
  const key = await findKey();
  const { host, urls } = sitemapUrls(await fetchText(`${origin}/sitemap.xml`));
  if (!dryRun && new URL(origin).host !== host) {
    throw new Error(`--site 호스트(${new URL(origin).host})와 sitemap 호스트(${host})가 다르면 보내지 않습니다.`);
  }
  const served = (await fetchText(`${origin}/${key}.txt`)).trim();
  if (served !== key) throw new Error(`${origin}/${key}.txt 내용이 키와 다릅니다(배포 전일 수 있음).`);

  const body = { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls };
  console.log(`키 파일 확인: ${origin}/${key}.txt`);
  console.log(`알릴 주소 ${urls.length}개:\n${urls.map((url) => `  ${url}`).join('\n')}`);
  if (dryRun) {
    console.log('--dry-run: 보내지 않았습니다.');
    return;
  }

  let failed = false;
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    // 200 접수, 202 접수·키 확인 대기. 그 밖은 실패(403 키 불일치, 422 호스트 불일치, 429 과다 요청).
    const ok = res.status === 200 || res.status === 202;
    if (!ok) failed = true;
    console.log(`${endpoint} → ${res.status}${ok ? '' : ` ${(await res.text()).slice(0, 200)}`}`);
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
