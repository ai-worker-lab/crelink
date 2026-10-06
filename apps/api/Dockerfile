# syntax=docker/dockerfile:1
# 크리링 API 운영 이미지. 빌드 컨텍스트는 저장소 루트입니다(허용 목록: 루트 .dockerignore).
#   docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t crelink-api:local .   (대상 플랫폼: linux/amd64 또는 linux/arm64)
# 빌드 단계는 빌더 플랫폼($BUILDPLATFORM)에서 TypeScript를 컴파일하고 운영 의존성만 모읍니다. 운영 의존성이 순수 JS라
# 결과를 대상 플랫폼($TARGETPLATFORM) 런타임에 그대로 옮기며, QEMU로 대상 플랫폼 명령을 실행하지 않습니다.
# native 애드온이 있는 의존성을 추가하면 이 전제가 깨집니다. 설명: apps/api/docs/README.md#컨테이너-이미지

FROM --platform=$BUILDPLATFORM node:22-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
# 의존성 설치를 소스 변경과 분리해 캐시합니다. pnpm 버전은 루트 package.json의 packageManager를 따릅니다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=crelink-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @crelink/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
# @crelink/shared(ESM)와 API를 빌드하고, API와 운영 의존성(@crelink/shared 빌드 결과 포함)만 /out에 모읍니다.
RUN --mount=type=cache,id=crelink-pnpm-store,target=/pnpm/store \
    pnpm --filter @crelink/shared build && \
    pnpm --filter @crelink/api build && \
    pnpm --filter @crelink/api deploy --prod --legacy /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# 코드는 root 소유(읽기 전용)로 두고 실행은 node 사용자로 합니다. 업로드·GeoIP 볼륨 경로는 node가 쓸 수 있게 미리 만듭니다
# (빈 named volume을 처음 붙이면 이 소유권을 이어받음).
RUN mkdir -p /data/uploads /data/geoip && chown node:node /data/uploads /data/geoip
COPY --from=build /out/package.json apps/api/package.json
COPY --from=build /out/node_modules apps/api/node_modules
COPY --from=build /out/dist apps/api/dist
COPY --from=build /out/migrations apps/api/migrations
USER node
EXPOSE 3000
# readiness(DB 포함). curl이 없는 이미지라 node 내장 fetch로 확인합니다. PORT는 실행 환경 값(운영 3000)을 씁니다.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health/ready`, { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]
