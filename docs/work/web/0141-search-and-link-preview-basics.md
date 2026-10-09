# 0141 검색·링크 미리보기 기본기(robots·sitemap·OG)

- 단계: 티켓
- 역할: web
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-10

## 목적

웹에는 `robots.txt`·`sitemap.xml`이 없고, 홈·문서에 링크 미리보기 이미지(OG 이미지)가 없습니다(`apps/web/src/app/layout.tsx`는 제목·설명만 둠). 검색 유입과 메신저·커뮤니티에 크리링 주소를 붙였을 때의 미리보기는 사람 계정 없이 AI 운영자가 직접 고칠 수 있는 모집 채널입니다([조사](../../product/research/initial-user-acquisition.md#국내-모집-채널)).

## 수용 기준

- [x] `robots.txt`가 공개 페이지(홈·문서·개인정보 처리방침·약관)를 허용하고 운영자·관리 화면(`/admin`, `/me`)을 막습니다.
- [x] `sitemap.xml`에 홈과 문서 페이지가 있습니다. 공개 랜딩(`/p/{publicId}`)을 넣을지는 R7(외부 진입은 단축 주소를 거침)과 함께 정하고 근거를 남깁니다.
- [x] 홈·문서에 OG 제목·설명·이미지가 있어 메신저 링크 미리보기에 크리링 소개가 보입니다.
- [x] 공개 랜딩 미리보기는 크리에이터 표시 이름·소개를 쓰는 지금 동작을 유지합니다.

## 범위

- 포함: robots, sitemap, OG 메타데이터와 이미지.
- 제외: Google Search Console·네이버 서치어드바이저 소유 확인(사람 계정 필요, 진행 기록에 사용자 요청으로 남김).

## 위험·복구

`robots.txt`를 잘못 쓰면 홈이 검색에서 빠질 수 있습니다. 배포 뒤 운영 주소에서 응답을 확인하고, 문제가 있으면 되돌려 배포합니다.

## 연결

- 요구: [PRD](../../product/crelink.md) `목표`, R7
- 근거: [초기 사용자 모집 조사](../../product/research/initial-user-acquisition.md)

## 진행 기록

- 2026-10-10: 생성(0090 조사에서 발견, 분류 대기). AI 운영자 첫 실행 백로그입니다.
- 2026-10-10: 분류·착수(사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인, 실행 `1827dbad-ec9c-4ace-b51a-c973adfeafd3`). 근거: 실사용자 0/100, 크리에이터 4명. 사람 계정 없이 바로 끝낼 수 있는 모집 채널 기반이고 한 실행 안에 머지까지 가능해 우선순위를 `P1`로 확정.
  - 구현: `apps/web/src/app/robots.ts`·`sitemap.ts`·`src/lib/site.ts`, 루트 레이아웃 `metadataBase`, 홈(`(public)/page.tsx`)·문서 레이아웃 OG, `apps/web/public/og-image.png`(1200×630, 원본 `apps/web/docs/og-image/og-image.html`).
  - 결정: robots는 `/admin`·`/me`·`/auth/`·`/api/`를 막고 나머지(홈·문서·개인정보 처리방침, 약관이 생기면 그것도) 허용. 공개 랜딩은 sitemap에 넣지 않음: R7에 따라 외부에서 온 랜딩 요청은 단축 주소로 보내 방문을 기록하므로 검색 봇이 방문 통계를 늘리고, 크리에이터가 검색 노출을 고를 설정도 아직 없음. robots에서 `/p/`를 막지도 않음(메신저 미리보기 동작 유지).
  - 결정: OG는 루트 레이아웃이 아니라 홈·문서 레이아웃에만 둠. 루트에 두면 공개 랜딩이 `og:title`(크리링)을 물려받아 크리에이터 미리보기와 어긋남. `SITE_URL`은 빌드 때 그려지는 화면도 같은 값을 내야 해서 코드 상수(운영 `WEB_URL`과 같은 값)로 둠.
  - 로컬 확인(`make up`, 슬롯 17): `/robots.txt`·`/sitemap.xml` 내용 기대대로, `/og-image.png` 200 `image/png`, `/` `og:title 크리링`·`og:url https://links.shaul.kr`·`og:image …/og-image.png` 1200×630, `/docs/guide` `og:title 크리링 문서`·`<title>사용 안내 | 크리링</title>`, `/p/zzzzzzzzzz`(same-origin) `og:` 없음·`noindex`(레이아웃이 OG를 물려주지 않음).
  - 사람 요청(범위 밖): Google Search Console·네이버 서치어드바이저 소유 확인과 sitemap 제출은 사람 계정이 필요합니다.
