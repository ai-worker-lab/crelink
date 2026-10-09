# 0148 검색엔진 소유 확인과 sitemap 제출(사람 계정 필요)

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-10

## 목적

0141로 운영에 `robots.txt`·`sitemap.xml`·OG가 생겼지만, 검색엔진에 사이트 소유를 확인하고 sitemap을 제출해야 홈·문서가 빨리 색인되고 검색 유입을 볼 수 있습니다. Google Search Console·네이버 서치어드바이저는 사람 계정이 필요해 AI 운영자가 할 수 없습니다(헌장 지킬 규칙 2: 외부 플랫폼 계정을 만들지 않음).

## 수용 기준

- [ ] 사람 결정 필요: 어느 계정(Google·네이버)으로 등록할지 정합니다. Google은 정함(2026-10-10 사용자 결정, 아래 진행 기록). 네이버는 아직 정하지 않음.
- [x] 소유 확인 방식을 정합니다. HTML 메타 태그나 확인 파일이면 값을 받아 web 티켓으로 반영합니다(확인 값은 비밀값이 아니지만 계정 정보는 저장소에 쓰지 않음). DNS TXT면 사람이 직접 등록합니다.
- [ ] 두 서비스에 `https://links.shaul.kr/sitemap.xml`을 제출하고 제출 결과(성공·오류)를 진행 기록에 남깁니다.

## 범위

- 포함: 소유 확인, sitemap 제출, 확인 태그가 필요하면 그 반영 티켓 생성.
- 제외: 검색 광고, 외부 계정 생성을 AI가 대신하는 일.

## 위험·복구

확인 태그를 잘못 넣어도 서비스 동작에는 영향이 없습니다. 태그를 지우면 소유 확인만 풀립니다.

## 연결

- 선행 작업: [0141](../web/0141-search-and-link-preview-basics.md)
- 요구: [PRD](../../product/crelink.md) `목표`
- 근거: [초기 사용자 모집 조사](../../product/research/initial-user-acquisition.md)

## 진행 기록

- 2026-10-10: 생성(AI 운영자 실행 `e1f4ffa2-d409-4be6-b34e-a2b2b9551f53`, 직전 실행 `1827dbad-ec9c-4ace-b51a-c973adfeafd3`의 "사람 결정 필요"). 사람 계정이 있어야 해 분류 대기로 둡니다.
- 2026-10-10: 사용자 결정(대화, AI 운영자 실행 `d9c7ae80-fdbd-40be-9150-735983b583b4`): Google Search Console 소유 계정은 사용자가 정한 운영자 Google 계정입니다. 주소는 개인정보라 저장소에 쓰지 않습니다(헌장 지킬 규칙 4). 상태를 `진행`, 우선순위를 `P1`로 확정합니다(사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인).
  - 확인 방식(AI 승인): Google은 `URL 접두어` 속성 `https://links.shaul.kr/`과 `HTML 태그`, 네이버는 `HTML 태그`입니다. 두 값을 받아 루트 레이아웃 `metadata.verification`(`google`, `other['naver-site-verification']`)에 넣습니다. 이 티켓의 역할(orchestrator)이 `apps/web/**`도 가지므로 따로 web 티켓을 만들지 않습니다. DNS TXT(Google `도메인` 속성)는 Cloudflare 사람 작업이라 쓰지 않습니다.
  - 다음: 사람이 두 서비스에서 확인 값(`content`)을 받아 알려 주면 → 메타 태그 반영·배포 → 사람이 `확인` 누르기 → sitemap 제출 → 결과를 여기 남김.
