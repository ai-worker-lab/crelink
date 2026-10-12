# 0173 IndexNow로 네이버·Bing 검색에 공개 페이지 알리기

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-12

## 목적

실사용자 0/100이고 신규 외부 유입이 0입니다(실행 `c2e1600e-c18b-45b0-9245-bd2bf54f79fb` 진단). 검색 등록 [0148](0148-search-console-registration.md)은 회사 Google·네이버 계정의 정상 접근이 없어 막혀 있습니다. [IndexNow](https://www.indexnow.org/documentation)는 계정 없이 사이트 루트의 키 파일로 소유를 확인하고 새·바뀐 주소를 검색엔진에 알리는 공개 프로토콜이며, [네이버 서치어드바이저](https://searchadvisor.naver.com/guide/indexnow-about)가 2023-07부터 지원합니다(참여 검색엔진끼리 접수 주소를 공유). 회사 계정·사람 인증·비용 없이 국내 검색 유입 경로를 여는 작업입니다.

## 수용 기준

- [x] `apps/web/public/<키>.txt`(파일 이름과 내용이 같은 키)가 웹 루트 `/<키>.txt`로 `text/plain; charset=UTF-8` 200 응답합니다(IndexNow 방식 1).
- [x] `node scripts/indexnow.mjs`(`pnpm search:indexnow`)가 `--site`의 `/sitemap.xml` 주소만 모아, 키 파일이 실제로 같은 키를 내는지 확인한 뒤 `api.indexnow.org`·`searchadvisor.naver.com`에 POST합니다. 200·202만 성공이며 나머지는 종료 코드 1입니다.
- [x] 공개 랜딩(`/p/…`)·단축 주소는 보내지 않습니다(sitemap이 원본이며 이미 제외, PRD R7·통계 오염 금지).
- [x] 키 파일이 배포되지 않았거나 `--site`와 sitemap 호스트가 다르면 보내지 않고 실패합니다. `--dry-run`은 확인만 합니다.
- [ ] main 병합·Deploy(운영 주소 검사) 성공 뒤 PM이 `guard` 0을 확인하고 운영에 한 번 보내 두 엔드포인트의 응답 코드와 시각을 진행 기록에 남깁니다.
- [ ] 보낸 시각 +7일에 context의 가입·실사용자와 함께 결과를 관측합니다(검색 유입 분모가 없으므로 인과 효과로 단정하지 않음).

## 범위

- 포함: 키 파일, 보내기 스크립트, 운영 1회 제출.
- 제외: Google(IndexNow 미참여, 0148 유지), 공개 랜딩 색인, 배포 때 자동 제출(새 페이지가 생길 때만 다시 보냄. FAQ상 반복 제출은 필요 없음).

## 위험·복구

- 키는 프로토콜상 누구나 읽는 공개 확인 값이며 인증 비밀값이 아닙니다. 남용돼도 우리 호스트의 공개 주소를 검색엔진에 알리는 것 외에는 할 수 없습니다.
- 철회: 키 파일을 지우고 배포하면 이후 제출은 403으로 거절됩니다. 이미 색인된 페이지는 robots·sitemap 기준을 따릅니다.
- 429(과다 요청)가 나오면 다시 보내지 않고 기록만 남깁니다.

## 연결

- 요구: [PRD](../../product/crelink.md) `목표`, R7
- 선행 기반: [0141](../web/0141-search-and-link-preview-basics.md)(robots·sitemap)
- 막힌 대안: [0148](0148-search-console-registration.md)
- 실행 기록: [모집 채널 PM 실행 목록](../../product/acquisition-playbook.md#pm-실행-목록) `G7`

## 진행 기록

- 2026-10-12: 생성·착수(실행 `40497f19-751e-4a99-9c00-f41fcee49e31`, 사용자 위임(2026-10-10·2026-10-12, [헌장](../../ops/ai-operator.md))에 따른 AI 승인). 근거: 실사용자 0/100, 7일 가입 4·방문 3, 외부 채널은 회사 계정·규칙 blocker. 계정 없이 가능한 검색 유입 경로라 우선순위 `P1`.
  - 구현: `apps/web/public/ac29baa52c0d9cee5ea068b71751b0e9.txt`, `scripts/indexnow.mjs`, 루트 `package.json` `search:indexnow`.
  - 로컬 확인(슬롯 5, `next dev`): `/ac29baa52c0d9cee5ea068b71751b0e9.txt` 200 `text/plain; charset=UTF-8`. `node scripts/indexnow.mjs --site http://127.0.0.1:5693 --dry-run` 종료 0, sitemap 10개 주소(홈·문서·가이드·개인정보·약관, `/p/` 없음). 같은 `--site`로 실제 보내기는 호스트 불일치로 거절, 종료 1.
  - 운영 읽기(이유: 배포 전 거절 동작 확인, 범위 `sitemap.xml`·키 파일 GET만): `node scripts/indexnow.mjs --dry-run` → 키 파일 404로 종료 1. 검색엔진에는 아무것도 보내지 않았습니다.
  - 당일(KST) main 병합 9건으로 상한(8) 도달. 병합은 KST 10/13 이후 실행에서 CI·`guard` 확인 뒤 합니다.
