#!/usr/bin/env node
// DB-IP IP to City Lite(MMDB, CC BY 4.0)를 .local/geoip/에 내려받습니다. API는 GEOIP_MMDB_PATH로 이 파일을 읽어 방문 기록의 국가·도시를 채웁니다.
// 라이선스: 결과를 쓰는 웹 페이지에 https://db-ip.com 출처 링크를 둡니다(웹 /privacy). 근거 docs/specs/crelink-mvp.md.
// 사용법: pnpm geoip:download [--force]
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEOIP_FILE = join(root, '.local', 'geoip', 'dbip-city-lite.mmdb');

const { values } = parseArgs({ options: { force: { type: 'boolean', default: false } } });
if (existsSync(GEOIP_FILE) && !values.force) {
  console.log(`geoip: 이미 있습니다: ${GEOIP_FILE} (다시 받으려면 --force)`);
  process.exit(0);
}

/** 이번 달 파일이 아직 없을 수 있어 이번 달부터 두 달 전까지 차례로 시도합니다. */
function candidateUrls(now = new Date()) {
  return [0, 1, 2].map((back) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
  });
}

mkdirSync(dirname(GEOIP_FILE), { recursive: true });
const partial = `${GEOIP_FILE}.partial`;
for (const url of candidateUrls()) {
  const response = await fetch(url);
  if (response.status === 404) {
    console.log(`geoip: ${url} 없음, 이전 달을 시도합니다.`);
    continue;
  }
  if (!response.ok || !response.body) {
    console.error(`geoip: ${url} 내려받기 실패 (HTTP ${response.status})`);
    process.exit(1);
  }
  console.log(`geoip: ${url} 내려받는 중(약 120MB)…`);
  try {
    await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(partial));
  } catch (error) {
    rmSync(partial, { force: true });
    console.error(`geoip: 압축 해제·저장 실패: ${error.message}`);
    process.exit(1);
  }
  renameSync(partial, GEOIP_FILE);
  console.log(
    `geoip: 저장했습니다: ${GEOIP_FILE}\n다음 make api-restart부터 API가 이 파일을 씁니다(GEOIP_MMDB_PATH는 PM2 설정이 자동으로 넘김).`,
  );
  process.exit(0);
}
console.error(
  'geoip: 최근 석 달의 DB-IP Lite 파일을 찾지 못했습니다. https://db-ip.com/db/download/ip-to-city-lite 를 확인하세요.',
);
process.exit(1);
