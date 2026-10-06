# 0023 SNS 채널 공식 아이콘

- 단계: 티켓
- 역할: web
- 상태: 완료
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-06

## 목적

SNS 채널이 플랫폼 아이콘 없이 글자 표시(IG·YT·TT 등)로만 보였습니다. 공식 출처의 브랜드 아이콘을 자산으로 두고 랜딩과 편집 화면에 반영합니다(PRD R12 "SNS 계정 주소를 넣으면 해당 SNS 아이콘이 붙는다").

## 수용 기준

- [x] 플랫폼 8종(인스타그램·유튜브·틱톡·네이버 블로그·X·스레드·페이스북·기타) 아이콘이 `apps/web/public/icons/sns/`에 있고, 출처·가이드라인·라이선스가 문서에 있다.
- [x] 랜딩 SNS 줄과 `/me` SNS 편집 행에 플랫폼 아이콘이 보인다.
- [x] `pnpm verify` 통과, `pnpm e2e` 통과.

## 범위

- 포함: `apps/web/**`(자산·컴포넌트·스타일·문서), 외부 의존 문서.
- 제외: 브랜드 컬러 사용(단색만), 고유 디자인(0020).

## 위험·복구

상표: 로고 상표권은 각 회사에 있습니다. 가이드라인이 허용하는 단색 사용만 하고 변형하지 않습니다. 네이버 블로그는 블로그 전용 아이콘 대신 네이버 로고(N)를 씁니다.

## 연결

- 요구: [PRD R12](../../product/crelink.md#요구사항)
- 출처·규칙: [SNS 채널 아이콘](../../../apps/web/docs/sns-icons.md)

## 진행 기록

- 2026-10-06: 생성·착수(브랜치 `work/0023-sns-channel-icons`). 사용자 요구 "sns 채널별로 아이콘이 없다. 공식 아이콘을 확인하고 asset으로 추가하고 반영".
- 2026-10-06: 구현. Simple Icons 16.34.0(CC0-1.0) SVG를 복사(각 아이콘의 공식 출처·가이드라인 URL은 패키지 데이터에서 확인해 문서화), 기타는 기존 링크 아이콘 모양. `SocialIcon`(CSS mask, 글자색 단색, `aria-hidden`), `SOCIAL_PLATFORM_LABELS`의 `mark` → `icon`.
- 2026-10-06: 검증. 자산 8개가 개발 서버에서 `image/svg+xml` 200. 390px에서 랜딩 SNS 줄·`/me` SNS 편집 행에 8종 아이콘 표시를 스크린샷으로 확인. 첫 `pnpm e2e`는 6개 모두 실패했는데, 원인은 실행 중이던 웹 개발 서버의 하위 서버가 브랜치 전환(`main` fast-forward 중 0019 이전 `next.config.ts`가 잠시 체크아웃됨) 때 `distDir` 없이 다시 떠 `.next`를 쓰던 것(로그 `.next/server/app/me/page.js` `MODULE_NOT_FOUND`)으로 이 변경과 무관. `make web-restart` 뒤 `.next-dev` 사용 확인, 개발 서버를 띄운 채 `pnpm verify` 8단계 통과 → `/`·`/me`·`/p/{id}` 200, `pnpm e2e` 6 passed, `pnpm smoke` 5 passed.
