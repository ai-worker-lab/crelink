import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // 운영 컨테이너 이미지(apps/web/Dockerfile)가 .next/standalone의 server.js와 추적된 의존성만 옮겨 씁니다.
  output: 'standalone',
  reactStrictMode: true,
  // 로컬 인스턴스 주소는 127.0.0.1(WEB_URL, scripts/lib/instance.mjs)인데 next dev는 localhost로 시작합니다.
  // Next 16은 다른 호스트에서 오는 개발 리소스(/_next/*, HMR) 요청을 기본으로 막아 화면이 하이드레이션되지 않으므로 허용합니다. 개발 서버에만 적용됩니다.
  allowedDevOrigins: ['127.0.0.1'],
  // next dev가 AGENTS.md에 영어 안내 블록을 써 넣지 않게 합니다. 같은 안내(설치된 Next.js 문서를 먼저 읽기)는 apps/web/AGENTS.md에 한국어로 둡니다.
  agentRules: false,
};

export default nextConfig;
