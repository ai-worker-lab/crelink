import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs/config';
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

/**
 * Sentry 빌드 설정. 소스맵 업로드는 빌드 환경에 `SENTRY_AUTH_TOKEN`(Dockerfile의 BuildKit secret)이 있을 때만 하고, 올린 뒤 소스맵을 지워
 * 이미지·정적 파일에 남기지 않습니다. 토큰이 없으면(로컬·PR CI) 소스맵을 만들지 않고 업로드도 건너뜁니다. 토큰이 있는데 업로드가 실패하면 빌드가 실패합니다.
 * `tunnelRoute`는 쓰지 않습니다: 브라우저가 Sentry로 직접 보내 Sentry가 브라우저 IP를 그대로 기록합니다(광고 차단기에 일부 이벤트가 막힐 수 있음).
 * 설명: apps/web/README.md#오류-모니터링, 결정: docs/adr/0012-error-monitoring-sentry.md
 */
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
  release: { name: process.env.SENTRY_RELEASE || undefined },
  sourcemaps: uploadSourceMaps ? { deleteSourcemapsAfterUpload: true } : { disable: true },
  widenClientFileUpload: true,
  telemetry: false,
  silent: !uploadSourceMaps,
  // 플러그인 기본값은 릴리스 생성·업로드 실패를 로그만 남기고 빌드를 계속합니다. 배포가 소스맵 없이 나가지 않게 실패로 바꿉니다.
  errorHandler: (error) => {
    throw error;
  },
});
