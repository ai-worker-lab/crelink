# 0026 웹 내부 토큰 헤더와 Vercel 배포 설정

- 단계: 티켓
- 역할: web
- 상위: 0024
- 상태: 준비
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

웹(Vercel)이 운영 API 호스트의 `/api/*`를 부를 때 내부 토큰 헤더를 붙이고, 모노레포를 Vercel에서 빌드·배포할 수 있게 설정합니다.

## 수용 기준

- [ ] 서버 컴포넌트 호출(`src/lib/api/server.ts`)과 BFF(`src/app/api/backend/[...path]/route.ts`)가 환경변수 `API_INTERNAL_TOKEN`이 있으면 모든 API 요청에 `X-Crelink-Internal` 헤더를 붙인다(없으면 붙이지 않음, 로컬 동작 불변). 토큰이 브라우저 번들·응답에 새지 않음을 확인한다.
- [ ] `apps/web/vercel.json`(또는 동등한 설정)이 모노레포 설치·빌드(`@crelink/shared`·디자인 토큰 선행 빌드)를 지정하고, 로컬에서 같은 명령으로 빌드가 통과한다. Vercel 프로젝트 설정 값(Root Directory·Node 버전 등)은 문서에 적는다.
- [ ] `apps/web/.env.example`·`apps/web/README.md`·`apps/web/CHANGELOGS.md` 갱신, `pnpm verify`·`pnpm e2e` 통과.

## 범위

- 포함: `apps/web/**`.
- 제외: 루트 워크플로(0028), 서버 설정.

## 위험·복구

토큰 헤더는 환경변수가 있을 때만 붙습니다. 로컬·e2e 동작은 그대로입니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
