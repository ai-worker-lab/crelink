# 0267 처리방침·약관·삭제 확인 페이지

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253, 0271
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

처리방침·약관·삭제 확인 페이지

위험 등급 R2, 담당 Sonnet medium.

## 수용 기준

- [x] `pnpm --filter @crelink/web test`, 위 12개 항목 대조

## 범위

- 포함: `app/(public)/privacy/**`, `app/(public)/terms/page.tsx`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. 처리방침 `인스타그램 댓글 자동 DM` 절(`#privacy-instagram`), 약관 7조 신설(메시지 내용 책임·팔로우 조건 금지·수신 거부 우회 금지, 3조 금지 행위 항목과 자동화 금지 조항 관계), 삭제 확인 페이지 `/privacy/instagram-deletion/[code]`(API 웹훅 응답 주소와 일치, `GET /api/public/instagram-deletions/:code`, noindex).
  - 검증: `pnpm --filter @crelink/web test` 155건 통과(새 시험 `status.spec.ts`), `pnpm lint` 오류 0(기존 경고 2건), `prettier --check` 통과. web typecheck는 `src/lib/landing-preview.spec.ts(72)`의 `instagramDmAvailable` 타입 오류 1건으로 실패하며 변경 전에도 같은 오류입니다(소유 밖). 개발 서버에서 처리됨(스텁 API)·찾을 수 없음(404, 형식 오류)·확인 불가(API 없음) 3상태와 `/privacy`·`/terms` 200을 curl로 확인했고 브라우저 시각 확인은 하지 않았습니다.
  - 회원 탈퇴 기능이 없어 수신 거부 기록의 탈퇴 파기는 `지금은 문의로 처리`로 적었습니다.
  - 법률 검토 대상 문장: Meta 전송의 이전받는 자·국가·표현, 크리에이터와 크리링의 위탁 여부, 약관 책임 조항, 시행일.
