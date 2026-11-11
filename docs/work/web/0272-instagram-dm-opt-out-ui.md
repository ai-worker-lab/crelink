# 0272 `/dm-opt-out` 화면(프래그먼트 `#t` 토큰을 읽어 POST)

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

`/dm-opt-out` 화면(프래그먼트 `#t` 토큰을 읽어 POST)

위험 등급 R2, 담당 Sonnet medium.

## 수용 기준

- [x] `pnpm --filter @crelink/web test` 통과, 390·1280 확인

## 범위

- 포함: `apps/web/src/app/(public)/dm-opt-out/**`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. `app/(public)/dm-opt-out/`에 서버 `page.tsx`(noindex, `referrer: no-referrer`), 클라이언트 `DmOptOut.tsx`, 순수 함수 `opt-out.ts`(+시험)를 두었습니다. 토큰은 `location.hash`의 `t`만 읽어 ref에 두고, `수신 거부` 버튼을 눌러야 기존 BFF `POST /api/backend/api/public/instagram-dm-opt-outs`(본문 `{ token }`, 0263이 만든 허용 규칙)를 보냅니다. 완료·유효하지 않음에서 `history.replaceState`로 프래그먼트를 지우고, 오류에서는 `다시 시도`를 위해 유지합니다. 같은 탭에서 프래그먼트만 바뀐 링크는 `hashchange`로 다시 읽습니다. `ROBOTS_DISALLOW`(`lib/site.ts`)에 `/dm-opt-out`을 한 줄 더했습니다.
- 2026-11-11: 검증. `pnpm --filter @crelink/web test` 155건 통과. `tsc --noEmit`은 `src/lib/landing-preview.spec.ts(72)` 한 건만 실패하며 이 변경과 무관합니다(기준 브랜치의 `instagramDmAvailable` 필수화, 0266에서도 동일 확인). ego-browser(TaskSpace `0272-opt-out-ui`, `next dev` 로컬)로 390px·1280px에서 토큰 없음·확인 대기·오류(재시도 버튼)·재시도 후 완료·서버 400 `opt_out_invalid`·처리 중 상태를 열었고 모두 가로 넘침 없음, 완료·유효하지 않음 뒤 주소 프래그먼트가 비어 있음, 요청 본문 `{"token":...}` 한 번과 URL에 토큰 없음을 확인했습니다. API 응답은 `window.fetch` mock이라 실제 API 연결은 통합 티켓(0269) 몫입니다.
