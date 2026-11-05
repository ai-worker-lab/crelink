# 0187 Next.js 보안 패치 적용 범위 확인

- 단계: 티켓
- 역할: web
- 상태: 검증
- 종류: 유지보수
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-05

## 목적

로컬 웹 첫 실행에서 Next.js 보안 preflight가 실제로 종료 코드 1을 내고 재시작을 요구했다. 설치된 16.4.0에 대한 공식 npm advisory 결과와 패치 16.4.1을 확인했으며, 방문자 수집 기능 변경과 분리해 적용·회귀 범위를 정한다.

## 수용 기준

- [x] 현재 공식 advisory와 설치 버전을 다시 확인하고 가장 작은 패치 업데이트를 적용한다.
- [x] 실제 사용하는 Next 기능의 영향과 lint/typecheck/build·공개 페이지·관리 화면 인증 경계 회귀를 검증한다.

## 범위

- 포함: Next.js 보안 패치와 해당 웹 의존성.
- 제외: 운영 배포, 기능 개편, 현재 사용하지 않는 Next 기능의 도입.

## 위험·복구

현재 소스의 Server Actions·use cache·next/image 사용은 검색에서 발견하지 못했으며 sharp는 0.35.5다. 라이브러리 취약 버전 해당 사실을 앱의 실제 악용 가능성으로 단정하지 않는다. lockfile을 포함한 최소 업데이트의 diff와 기존 버전 복귀 경로를 검토한다.

## 연결

- [Server Actions DoS](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)
- [Image Optimization SVG RCE](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
- [use cache RCE](https://github.com/advisories/GHSA-673q-mjm6-r5xr)
- `apps/web/package.json`, `pnpm-lock.yaml`

## 진행 기록

- 2026-11-05: 실제 preflight 종료와 공식 npm bulk 응답을 read-only로 확인. 같은 개발 서버 명령 재시작 후 200 응답은 확인했으나 패키지 업데이트는 이번 수집 변경에 포함하지 않았다.

- 2026-11-06: 개발 서버 재시작에서도 보안 preflight 중단이 반복되어 실행에 필요한 최소 패치 16.4.1을 적용했다. 최초 pnpm up이 workspace의 다른 허용 버전도 재해석해, HEAD 잠금에서 Next/env/SWC·Next peer 참조만 갱신하고 metadata의 실제 registry integrity와 의존 범위를 검증했다. 관련 없는 importer가 같다는 assert와 `pnpm install --frozen-lockfile` 통과. 공식 npm bulk(2026-11-06T00:05:16.630+09:00)는 next16.4.1 advisory 0건을 반환했다. source 버전과 실제 악용 가능성은 구분하며 운영 배포는 하지 않았다.
- 2026-11-06: 최소 잠금 변경은88줄이며 다른 importer 버전은 보존했다. Next16.4.1 고정 설치 후 최종 verify8단계404검사·390/1280 공개 페이지 실경로가 통과했고 개발 서버가 추가 보안 중단 없이 기동했다. /me 비로그인307·운영자 API401 및 admin SSR의 redirect 표시를 확인했다. 로그인한 관리 화면 실사용과 운영 배포는 미실행이며 패치 상태는 검증 인계한다.
