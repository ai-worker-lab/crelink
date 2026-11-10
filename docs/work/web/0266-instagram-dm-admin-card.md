# 0266 운영자 정지 카드

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

운영자 정지 카드

위험 등급 R2, 담당 Sonnet medium.

## 수용 기준

- [x] `pnpm --filter @crelink/web test`, off 전환 확인

## 범위

- 포함: `components/admin/InstagramDmSetting.tsx`, `app/admin/ad-banners/page.tsx`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. `InstagramDmSetting` 카드(끔·운영자만·모든 크리에이터 라디오, 일반 공개 경고 상시 표시, `모든 크리에이터` 선택 시 확인 시트·첫 초점 취소)를 `/admin/ad-banners`의 광고 블록 카드 아래에 더했습니다. 선택 규칙은 `lib/instagram-dm-audience.ts`로 분리해 시험합니다. 계정별 정지 화면은 설계의 화면 상태표에 없어 만들지 않고 BFF 허용 목록에만 `PUT .../connections/:userId/pause`를 더했습니다. 조회 `GET /api/admin/instagram-dm`은 기존 관례대로 서버 렌더만 부르므로 허용 목록에 넣지 않았습니다.
- 2026-11-11: 검증. `pnpm --filter @crelink/web test` 154건 통과(off 전환 mock 시험·BFF 허용 시험 포함). `tsc --noEmit`은 `src/lib/landing-preview.spec.ts(72)` 한 건만 실패하며 이 변경 전 기준 브랜치에서도 같습니다(0264가 선택 필드로 읽던 `instagramDmAvailable`이 공유 계약에서 필수가 됨, 이 티켓 범위 밖). 브라우저 확인은 하지 않았습니다(통합 단계 몫).
