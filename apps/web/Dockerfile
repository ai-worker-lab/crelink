# syntax=docker/dockerfile:1
# 크리링 웹 운영 이미지(Next.js standalone). 빌드 컨텍스트는 저장소 루트입니다(허용 목록: 루트 .dockerignore).
#   docker build -f apps/web/Dockerfile -t crelink-web:local .
# 서버 전용 환경변수(API_INTERNAL_URL·API_INTERNAL_TOKEN)는 실행 시점에만 읽으므로 이미지에 넣지 않습니다.
# 정적으로 미리 렌더링되는 화면(/privacy, 404)은 API를 부르지 않습니다(next build 경로 표 ○).

FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
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
RUN pnpm --filter @crelink/shared build && \
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
