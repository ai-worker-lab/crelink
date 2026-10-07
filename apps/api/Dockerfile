# syntax=docker/dockerfile:1
# 크리링 API 운영 이미지. 빌드 컨텍스트는 저장소 루트입니다(허용 목록: 루트 .dockerignore).
#   docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t crelink-api:local .   (대상 플랫폼: linux/amd64 또는 linux/arm64)
# 빌드 단계는 빌더 플랫폼($BUILDPLATFORM)에서 TypeScript를 컴파일하고 운영 의존성만 모읍니다. 운영 의존성이 순수 JS라
# 결과를 대상 플랫폼($TARGETPLATFORM) 런타임에 그대로 옮기며, QEMU로 대상 플랫폼 명령을 실행하지 않습니다.
# native 애드온이 있는 의존성을 추가하면 이 전제가 깨집니다. 설명: apps/api/docs/README.md#컨테이너-이미지
# Sentry: 빌드 인자 SENTRY_RELEASE(배포 커밋 SHA)는 런타임 ENV가 됩니다. BuildKit secret sentry_auth_token이 있을 때만 소스맵을
# Sentry에 올립니다(SENTRY_ORG·SENTRY_PROJECT 필요, 업로드 실패면 빌드 실패). 없으면 건너뜁니다(로컬·PR CI).
#   docker buildx build ... --build-arg SENTRY_RELEASE=<SHA> --build-arg SENTRY_ORG=<org> --build-arg SENTRY_PROJECT=<project> \
#     --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN -f apps/api/Dockerfile .
#   설명: apps/api/docs/README.md#오류-모니터링

FROM --platform=$BUILDPLATFORM node:24-slim AS build
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
# @crelink/shared(ESM)와 API를 빌드합니다.
RUN --mount=type=cache,id=crelink-pnpm-store,target=/pnpm/store \
    pnpm --filter @crelink/shared build && \
    pnpm --filter @crelink/api build
# 토큰이 있으면 dist에 Sentry debug ID를 넣고(sourcemaps inject) 소스맵을 release에 올립니다. 토큰은 이 RUN에서만 보이고 이미지·캐시에 남지 않습니다.
ARG SENTRY_RELEASE=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
# secret은 캐시 키에 들어가지 않으므로, 토큰 유무를 이 인자로 키에 넣어 토큰 없이 만든 층(PR CI·토큰 등록 전 빌드)을 재사용하지 않게 합니다.
ARG SENTRY_UPLOAD=""
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    if [ -n "$SENTRY_AUTH_TOKEN" ]; then \
      : "${SENTRY_ORG:?SENTRY_AUTH_TOKEN이 있으면 SENTRY_ORG 빌드 인자가 필요합니다}" \
        "${SENTRY_PROJECT:?SENTRY_AUTH_TOKEN이 있으면 SENTRY_PROJECT 빌드 인자가 필요합니다}" \
        "${SENTRY_RELEASE:?SENTRY_AUTH_TOKEN이 있으면 SENTRY_RELEASE 빌드 인자가 필요합니다}" && \
      cd apps/api && \
      pnpm exec sentry-cli sourcemaps inject dist && \
      pnpm exec sentry-cli sourcemaps upload --org "$SENTRY_ORG" --project "$SENTRY_PROJECT" --release "$SENTRY_RELEASE" dist; \
    else \
      echo 'sentry_auth_token secret 없음: Sentry 소스맵 업로드를 건너뜁니다.'; \
    fi
# API와 운영 의존성(@crelink/shared 빌드 결과 포함)만 /out에 모읍니다.
RUN --mount=type=cache,id=crelink-pnpm-store,target=/pnpm/store \
    pnpm --filter @crelink/api deploy --prod --legacy /out

FROM node:24-slim AS runtime
# SENTRY_RELEASE: Sentry 이벤트의 release(소스맵 업로드 release와 같은 값). 비면 release 없이 보냅니다.
ARG SENTRY_RELEASE=""
ENV NODE_ENV=production \
    SENTRY_RELEASE=$SENTRY_RELEASE
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
