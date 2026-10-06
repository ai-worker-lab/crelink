import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 개발 서버(package.json start)는 NEXT_DIST_DIR=.next-dev로 빌드 출력(.next)과 나눕니다.
  // 같은 디렉터리를 쓰면 pnpm verify의 next build가 실행 중인 개발 서버의 파일을 덮어써 500이 납니다(docs/work/orchestrator/0019-verify-build-clobbers-dev-web.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // 운영 컨테이너 이미지(apps/web/Dockerfile)가 .next/standalone의 server.js와 추적된 의존성만 옮겨 씁니다.
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
