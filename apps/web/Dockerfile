# syntax=docker/dockerfile:1
# 크리링 웹 운영 이미지(Next.js standalone). 빌드 컨텍스트는 저장소 루트입니다(허용 목록: 루트 .dockerignore).
#   docker build -f apps/web/Dockerfile -t crelink-web:local .
# 서버 전용 환경변수(API_INTERNAL_URL·API_INTERNAL_TOKEN)는 실행 시점에만 읽으므로 이미지에 넣지 않습니다.
# 정적으로 미리 렌더링되는 화면(/privacy, 404)은 API를 부르지 않습니다(next build 경로 표 ○).
# Sentry: NEXT_PUBLIC_SENTRY_DSN(서버·브라우저 공용, 공개 값)과 SENTRY_RELEASE(배포 커밋 SHA)는 빌드 시점에 번들에 들어가므로
# 이미지가 배포 대상(Sentry 프로젝트)별이 됩니다. DSN이 비면 Sentry를 켜지 않습니다. BuildKit secret sentry_auth_token이 있을 때만
# 소스맵을 올리고 지웁니다(SENTRY_ORG·SENTRY_PROJECT 필요, 업로드 실패면 빌드 실패). 없으면 소스맵을 만들지 않습니다(로컬·PR CI).
#   docker build --build-arg NEXT_PUBLIC_SENTRY_DSN=<DSN> --build-arg SENTRY_RELEASE=<SHA> --build-arg SENTRY_ORG=<org> \
#     --build-arg SENTRY_PROJECT=<project> --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN -f apps/web/Dockerfile .
#   설명: apps/web/README.md#오류-모니터링

FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# ca-certificates: sentry-cli(소스맵 업로드)는 시스템 CA로 sentry.io TLS를 검증하는데 node:*-slim에는 CA 묶음이 없습니다. 빌드 단계에만 둡니다.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && \
    corepack enable
WORKDIR /repo
# 의존성 설치를 소스 변경과 분리해 캐시합니다. pnpm 버전은 루트 package.json의 packageManager를 따릅니다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/design-tokens/package.json packages/design-tokens/
RUN --mount=type=cache,id=crelink-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @crelink/web...
COPY packages/shared packages/shared
COPY packages/design-tokens packages/design-tokens
COPY apps/web apps/web
# 디자인 토큰 생성물(packages/design-tokens/generated)은 커밋된 것을 씁니다. 원본과의 일치 검사는 CI(pnpm typecheck)가 맡습니다
# (검사가 이미지에 넣지 않는 design/ 폴더까지 비교하기 때문).
# Sentry 빌드 인자는 이 RUN의 환경변수로 next.config.ts(withSentryConfig)와 번들이 읽습니다. 토큰은 이 RUN에서만 보이고 이미지·캐시에 남지 않습니다.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG SENTRY_RELEASE=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
# secret은 캐시 키에 들어가지 않으므로, 토큰 유무를 이 인자로 키에 넣어 토큰 없이 만든 층(PR CI·토큰 등록 전 빌드)을 재사용하지 않게 합니다.
ARG SENTRY_UPLOAD=""
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    if [ -n "$SENTRY_AUTH_TOKEN" ]; then \
      : "${SENTRY_ORG:?SENTRY_AUTH_TOKEN이 있으면 SENTRY_ORG 빌드 인자가 필요합니다}" \
        "${SENTRY_PROJECT:?SENTRY_AUTH_TOKEN이 있으면 SENTRY_PROJECT 빌드 인자가 필요합니다}" \
        "${SENTRY_RELEASE:?SENTRY_AUTH_TOKEN이 있으면 SENTRY_RELEASE 빌드 인자가 필요합니다}"; \
    else \
      echo 'sentry_auth_token secret 없음: Sentry 소스맵을 만들지도 올리지도 않습니다.'; \
    fi && \
    pnpm --filter @crelink/shared build && \
    pnpm --filter @crelink/web build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# standalone 출력(server.js와 추적된 의존성)에 정적 파일과 public을 합칩니다. 코드는 root 소유(읽기 전용), 실행은 node 사용자.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/privacy`, { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
