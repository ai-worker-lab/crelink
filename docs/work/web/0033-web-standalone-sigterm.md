# 0033 웹 standalone 서버의 SIGTERM 동작 확인과 처리

- 단계: 티켓
- 역할: web
- 상위: 0031
- 상태: 진행
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

무중단 전환(ADR 0011)에서는 트래픽을 새 색으로 옮긴 뒤 구 색 웹 컨테이너를 `docker stop`합니다. 이때 웹이 진행 중 요청(SSR, BFF `/api/backend/*` 프록시, OAuth 콜백)을 끊으면 전환 직전 요청이 실패합니다. Next 문서는 SIGTERM·SIGINT를 받으면 진행 중 요청과 `after()`를 마치고 종료한다고 하지만, 운영 이미지의 standalone `server.js`(`apps/web/Dockerfile`, `CMD ["node", "apps/web/server.js"]`, compose `init: true`)에서 실제로 그런지는 확인하지 않았습니다([조사](../../references/zero-downtime-deploy.md#두-버전이-동시에-도는-동안의-조건)).

선택 항목으로, 전환 뒤 옛 HTML을 가진 브라우저가 옛 chunk를 요청해 404가 나는 버전 차이(지금도 배포마다 있음)를 `deploymentId`로 줄입니다.

## 수용 기준

- [ ] 실측: 운영과 같은 조건(웹 이미지, `init: true`, `read_only`)으로 웹 컨테이너를 띄우고 `API_INTERNAL_URL`을 5초 뒤 응답하는 임시 모형 API로 둔 뒤, BFF 경로(`/api/backend/api/health`) 요청이 진행 중일 때 `docker stop -t 30` → 그 요청의 결과(2xx 여부), 정지 중 새 연결 처리, 컨테이너 종료 코드·걸린 시간을 진행 기록에 남긴다. 임시 파일은 저장소에 남기지 않는다.
- [ ] 진행 중 요청이 끊기면(2xx가 아니거나 즉시 종료) Next [self-hosting 문서](https://nextjs.org/docs/app/guides/self-hosting)의 수동 신호 처리(`NEXT_MANUAL_SIG_HANDLE`) 또는 동등한 방법으로 고치고 같은 실측으로 2xx를 확인한다. 이미 2xx면 코드 변경 없이 근거만 남긴다.
- [ ] (선택) `apps/web/next.config.ts`에 `deploymentId: process.env.NEXT_DEPLOYMENT_ID`를 넣고 `apps/web/Dockerfile`이 빌드 인자로 받게 한다. 값이 없으면 지금과 같게 동작한다. 빌드 인자에 커밋 SHA를 넣는 워크플로 변경(`.github/workflows/`)은 orchestrator 몫이라 진행 기록에 인계한다.
- [ ] 결과와 종료 동작을 `apps/web/docs/`(또는 `apps/web/README.md`의 운영 이미지 설명)에 적고 `apps/web/CHANGELOGS.md`, `pnpm verify` 통과.

## 범위

- 포함: `apps/web/**`(필요하면 서버 진입 래퍼, `next.config.ts`, `Dockerfile`, 문서·변경 기록).
- 제외: compose `stop_grace_period`(0034), 서버 측 API 주소를 색 별칭으로 바꾸는 compose 변경(0035), 워크플로 빌드 인자(orchestrator).

## 위험·복구

- 신호 처리를 직접 넣으면 종료가 늦어지거나 프로세스가 끝나지 않을 수 있습니다. 상한(grace 30초 안)과 강제 종료 경로를 둡니다. 되돌리기: 커밋을 되돌려 재배포(데이터 영향 없음).
- `deploymentId`는 값이 바뀔 때 열린 탭이 전체 새로고침(hard navigation)을 합니다. 작성 중인 폼 입력이 사라질 수 있어 선택 항목으로 둡니다.

## 연결

- 에픽: [0031 운영 무중단 배포](../epics/0031-zero-downtime-deploy.md)
- 결정: [ADR 0011](../../adr/0011-zero-downtime-deploy.md) 결정 1(0단계)
- 코드: `apps/web/Dockerfile`, `apps/web/next.config.ts`, `apps/web/src/app/api/backend/[...path]/route.ts`, `apps/web/src/lib/api/server.ts`
- 외부: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [deploymentId](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId)

## 진행 기록

- 2026-10-07: 생성(에픽 0031 계획). 선행 없음, 0032와 병렬 가능. 0035가 이 결과를 기다림.
- 2026-10-07: 착수(브랜치 `work/0033-web-standalone-sigterm`).
