# 0244 공유관리 페이지 웹

- 단계: 티켓
- 역할: web
- 상위: 0241
- 선행: 0243
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

BFF 헤더 전달과 페이지 전환, 초대 수락, 공동 관리자 화면을 구현하고 처리방침을 고칩니다.

## 수용 기준

- [x] 관리 화면의 모든 API 호출이 대상 페이지 헤더를 보내고 BFF가 형식 검증 후 전달합니다.
- [x] 공유 화면의 저장이 개인 페이지를 바꾸지 않음을 BFF를 통과하는 시험으로 확인합니다.
- [x] 페이지 전환, 초대 수락, 공동 관리자 메뉴, 편집자 숨김, 처리방침이 설계와 같습니다.
- [x] `pnpm verify`가 통과합니다.

## 범위

- 포함: `apps/web/**`.
- 제외: API, 시각 토큰 추가, 쿠키에 활성 페이지 저장, `window.confirm` 신규 사용.

## 위험·복구

처리방침 밖 처리가 없도록 기능과 같은 배포로 나갑니다. 문제가 생기면 직전 릴리스로 롤백합니다.

## 연결

- 설계: [공유관리 페이지](../../specs/shared-pages.md)

## 진행 기록

- 2026-11-10: 생성. 구현은 Codex에 위임합니다.


- 2026-11-10: 웹 구현. BFF 허용 목록을 시험 가능한 모듈로 옮기고 유효한 대상 헤더만 일반·업로드 요청에 전달합니다. browserApi는 현재 관리 경로에서 대상 id를 읽으며 활성 페이지 저장소는 추가하지 않았습니다. 관리 업로드(ImageField)는 기존 browserApi를 사용함을 확인했습니다. 방문자 계측의 직접 fetch는 관리 저장 호출이 아닙니다.
- 2026-11-10: 서버 랜딩·분석 조회에 주소 publicId를 전달하고 GET /me는 제외했습니다. 404는 기존 찾을 수 없음 안내와 /me 링크로 연결합니다. 페이지 전환·공유 편집 표시·공동 관리자(/members)의 멤버 목록/초대/취소/내보내기/나가기를 추가하고 EditSheet 첫 초점은 취소로 두었습니다. 편집자의 데스크톱 주소 입력·모바일 주소 변경·광고 스위치를 숨기며 오류는 ActionStatus로 알립니다.
- 2026-11-10: /invite 해시 즉시 제거·POST 본문 전달·로그인 필요 시 sessionStorage 임시 보관·수락/거절을 구현했습니다. 로그인 복귀는 웹의 기존 주소 검증에 정확히 /invite만 추가했습니다. API·공유 계약 수정이나 의존성·색·디자인 토큰 추가는 없습니다. 처리방침에 공동 관리 수집·열람·해제·초대 기록 보존을 반영했습니다.
- 2026-11-10: Node 24(PATH="/opt/homebrew/opt/node@24/bin:$PATH")로 검증했습니다. pnpm --filter @crelink/shared build 종료 0, pnpm --filter @crelink/web typecheck 종료 0. pnpm verify --fast는 첫 실행에서 서식 오류로 종료 1, 수정 후 종료 0(6단계 통과)입니다.
- 2026-11-10: 추가 시험은 pnpm --filter @crelink/web exec node --test src/lib/api/shared-pages.spec.ts 종료 0(11/11 통과). 실제 BFF route를 fetch 대역과 실행해 일반·multipart 헤더/본문, 허용 메서드, browserApi 경로/업로드, 서버 헤더와 계정 조회 제외, 토큰 제거/복귀/수락 POST/오류, 광고 스위치 렌더를 확인했습니다. 전체 웹 시험의 localhost 필요 기존 2개는 샌드박스의 listen EPERM으로 실패하며 기존 시험은 변경하지 않았습니다.
- 2026-11-10: 실제 두 계정에서 BFF 경유 저장이 개인 페이지를 바꾸지 않는지, 초대·멤버 해제·비밀글·통계의 실제 API 연결, 1280px/390px 브라우저·초점·콘솔은 미확인입니다. localhost 제약에 따라 DB API 시험·pnpm smoke·실제 서버 접속은 미실행입니다. pnpm verify 전체와 next build도 미실행입니다. 수용 기준 중 통합 동작과 전체 verify는 확인하지 않아 체크하지 않았습니다.
- 2026-11-10: 최종 pnpm --filter @crelink/web test 종료 1(121개 중 119 통과, 기존 localhost 시험 2개 EPERM 실패). pnpm verify --fast 재실행 종료 0(6/6 단계 통과), pnpm work:scope 0244 --base work/0243-shared-pages-api 종료 0(변경 파일 24개 소유 범위 통과), git diff --check 종료 0입니다.
- 2026-11-10: CEO 재검증과 독립 QA. 샌드박스 밖에서 `pnpm verify` 8단계 통과. 독립 QA가 BFF를 통과한 요청 107건과 ego-browser 화면으로 저장 격리, 권한, 초대, 처리 흐름을 확인했고 재현 가능한 결함은 없었습니다. `pnpm smoke`는 이 맥에 Playwright Chromium이 없어 실행하지 못해 GitHub CI 수동 실행으로 대신합니다.

- 2026-11-10: CI E2E 회귀 수정. origin/main의 /settings 리디렉트 구현을 그대로 복구하고 공동 관리자 화면을 /members로 옮겼습니다. 메뉴 segment는 members, 라벨은 공동 관리자이며 맨 끝에 배치했습니다. h1과 문서 제목은 managerMenuLabel을 사용합니다. tests/e2e는 수정하지 않았습니다.
- 2026-11-10: 회귀 수정 검증(Node 24). pnpm --filter @crelink/shared build 종료 0, pnpm --filter @crelink/web typecheck 종료 0, pnpm verify --fast 종료 0(6/6 단계), pnpm work:scope 0244 --base work/0243-shared-pages-api 종료 0(25개 파일). pnpm --filter @crelink/web test 종료 1(121개 중 119 통과, 기존 localhost listen EPERM 2건만 실패). git show origin/main과 복구한 settings/page.tsx의 바이트 일치를 확인했습니다. rg로 apps/web/src 전체를 검색해 settings를 가리키는 공동 관리자 링크가 없음을 확인했습니다. E2E·실제 브라우저·서버 접속 시험은 localhost 제한으로 미실행입니다.
