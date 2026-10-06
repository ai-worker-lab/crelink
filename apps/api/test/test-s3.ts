import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { S3StorageConfig } from '../src/config.service';

/** 운영 SeaweedFS(home-server)와 같은 버전. */
export const TEST_S3_IMAGE = 'chrislusf/seaweedfs:4.47';
const BUCKET = 'crelink-uploads';
// 시험 전용 자격 증명. `crelink`는 운영 identity처럼 버킷 범위 Read·Write·List·Tagging만 있고 버킷을 만들 수 없습니다.
const ADMIN = { accessKeyId: 'test-admin', secretAccessKey: 'test-admin-secret' };
const APP = { accessKeyId: 'test-crelink', secretAccessKey: 'test-crelink-secret' };

export interface TestS3 {
  /** 앱 identity(`crelink`)로 접근하는 설정. */
  config: S3StorageConfig;
  /** `FILE_STORAGE=s3`로 API를 띄울 환경변수. */
  env: Record<string, string>;
  /** 버킷을 만들 수 있는 관리 identity 클라이언트(시험 확인용). */
  admin: S3Client;
  stop(): void;
}

function docker(args: string[]): string {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    }).trim();
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : '';
    const detail = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(
      `S3 계약 시험은 Docker로 ${TEST_S3_IMAGE}를 띄웁니다. Docker가 실행 중인지 확인하세요(docker ${args[0]}: ${detail})`,
    );
  }
}

/**
 * 일회용 SeaweedFS(`weed server -s3`) 컨테이너를 127.0.0.1 임의 포트에 띄우고 버킷 `crelink-uploads`를 만듭니다.
 * 데이터는 컨테이너 안에만 있고 `stop()`이 컨테이너를 지웁니다.
 */
export async function startTestS3(): Promise<TestS3> {
  const configDir = mkdtempSync(join(tmpdir(), 'crelink-s3-'));
  const identities = [
    {
      name: 'admin',
      credentials: [{ accessKey: ADMIN.accessKeyId, secretKey: ADMIN.secretAccessKey }],
      actions: ['Admin'],
    },
    {
      name: 'crelink',
      credentials: [{ accessKey: APP.accessKeyId, secretKey: APP.secretAccessKey }],
      actions: ['Read', 'Write', 'List', 'Tagging'].map((action) => `${action}:${BUCKET}`),
    },
  ];
  writeFileSync(join(configDir, 's3.json'), JSON.stringify({ identities }));
  // 컨테이너 사용자가 읽을 수 있게 엽니다(시험 전용 값).
  chmodSync(configDir, 0o755);
  chmodSync(join(configDir, 's3.json'), 0o644);
  const container = docker([
    'run',
    '-d',
    '--rm',
    '-p',
    '127.0.0.1::8333',
    '-v',
    `${configDir}:/etc/crelink-s3:ro`,
    TEST_S3_IMAGE,
    'server',
    '-s3',
    '-s3.config=/etc/crelink-s3/s3.json',
    '-dir=/data',
  ]);
  const stop = () => {
    try {
      execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  };
  try {
    const port = docker(['port', container, '8333/tcp']).split('\n')[0].split(':').pop();
    const endpoint = `http://127.0.0.1:${port}`;
    const admin = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: ADMIN });
    // 마스터·볼륨·필러가 모두 뜰 때까지 버킷 만들기를 다시 시도합니다.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
        break;
      } catch (error) {
        if (attempt >= 120) throw error;
        await sleep(500);
      }
    }
    const config: S3StorageConfig = { endpoint, region: 'us-east-1', bucket: BUCKET, ...APP };
    const env = {
      FILE_STORAGE: 's3',
      S3_ENDPOINT: endpoint,
      S3_BUCKET: BUCKET,
      S3_ACCESS_KEY_ID: APP.accessKeyId,
      S3_SECRET_ACCESS_KEY: APP.secretAccessKey,
    };
    return {
      config,
      env,
      admin,
      stop() {
        admin.destroy();
        stop();
      },
    };
  } catch (error) {
    stop();
    throw error;
  }
}
