import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { S3StorageConfig } from '../config.service';
import { FileStorage } from './file-storage';

/**
 * 요청 한도. 4MB 업로드가 운영 경로(Cloudflare Tunnel → SeaweedFS)에서 약 2.5초라 한 번 시도에 15초를 줍니다.
 * SDK 표준 재시도(`standard`)는 연결 오류·시간 초과·5xx·스로틀만 지수 백오프로 다시 시도하고 4xx(412 포함)는 바로 실패합니다.
 * 최악의 경우 요청 하나가 약 3 × (3s 연결 + 15s) ≈ 1분 걸립니다.
 */
export const S3_REQUEST_POLICY = { connectionTimeoutMs: 3_000, requestTimeoutMs: 15_000, maxAttempts: 3 } as const;
/** 기동 시 버킷 확인 한도(재시도 포함 전체). 기동을 이만큼만 늦춥니다. */
const BUCKET_CHECK_TIMEOUT_MS = 5_000;

/**
 * S3 호환 저장소(운영 SeaweedFS `https://s3.shaul.kr`, 버킷 `crelink-uploads`)에 key 이름 객체로 저장합니다.
 * path-style 주소(`<endpoint>/<bucket>/<key>`)를 쓰고, 자격 증명은 설정 값만 씁니다(SDK 기본 체인의 `AWS_*`·`~/.aws`를 보지 않음).
 */
export class S3FileStorage extends FileStorage implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(S3FileStorage.name);
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    super();
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: S3_REQUEST_POLICY.maxAttempts,
      retryMode: 'standard',
      requestHandler: {
        connectionTimeout: S3_REQUEST_POLICY.connectionTimeoutMs,
        requestTimeout: S3_REQUEST_POLICY.requestTimeoutMs,
        throwOnRequestTimeout: true,
      },
    });
  }

  /**
   * 조건부 PUT(`If-None-Match: *`)이라 같은 key가 있으면 저장소가 412로 거부하고 이 메서드는 실패합니다(SeaweedFS 4.47 확인).
   * 첫 시도가 저장된 뒤 응답만 잃어 재시도가 412를 받으면 업로드는 실패하고 DB에 없는 객체가 남습니다.
   */
  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: data, IfNoneMatch: '*' }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      if (!object.Body) return null;
      const bytes = await object.Body.transformToByteArray();
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 버킷에 닿는지(HeadBucket) 가볍게 확인해 로그로 남깁니다. 실패해도 기동은 계속하고 readiness에도 넣지 않습니다
   * (저장소 장애가 업로드·이미지 조회 밖의 단축 이동까지 멈추지 않게. 근거: apps/api/docs/README.md#이미지-저장소).
   */
  async checkBucket(): Promise<boolean> {
    const target = `${this.config.endpoint}/${this.config.bucket}`;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }), {
        abortSignal: AbortSignal.timeout(BUCKET_CHECK_TIMEOUT_MS),
      });
      this.logger.log(`파일 저장소 s3 확인: ${target} 접근 가능`);
      return true;
    } catch (error) {
      const status = error instanceof S3ServiceException ? ` HTTP ${error.$metadata.httpStatusCode ?? '?'}` : '';
      const name = error instanceof Error ? error.name : String(error);
      this.logger.warn(
        `파일 저장소 s3 확인 실패: ${target} (${name}${status}). 업로드·이미지 조회가 실패합니다. 런북: infra/docs/prod-runbook.md#9-업로드-저장소`,
      );
      return false;
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.checkBucket();
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
