# 0014 크리링 MVP

- 단계: 에픽
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

크리에이터가 인스타그램 프로필에 걸 크리링 단축 URL과 랜딩페이지를 만들고, 크리링이 접근 데이터를 쌓아 운영자가 볼 수 있는 최소 제품을 localhost에서 동작시킵니다.

## 수용 기준

- [x] 설계 문서 `검증 계획`의 E2E 시나리오 1~4가 실제 API·웹·DB로 통과한다(0018).
- [x] PRD R1~R18의 MVP 수용 기준을 요구 대응표의 티켓이 모두 덮는다(R17 0021, R18 0022 추가).
- [x] 구글 OAuth 키를 넣으면 실제 구글 계정으로 가입·로그인할 수 있다(키는 사용자가 발급).

## 범위

- 포함: PRD `범위`의 포함(MVP).
- 제외: PRD `범위`의 제외(MVP), 설계 `미정`의 다음 phase 항목.

## 위험·복구

개인정보(IP 원문·기기·위치)를 1년 보관합니다. 법률 검토 전이며 로컬 개발 데이터만 다룹니다. 외부 공개·배포는 하지 않습니다.

## 연결

- PRD: [docs/product/crelink.md](../../product/crelink.md)
- 기술 설계: [docs/specs/crelink-mvp.md](../../specs/crelink-mvp.md)

## 진행 기록

- 2026-10-06: 생성. 설계 승인, 티켓 0015~0018 분해.
- 2026-10-06: 0015~0018 완료. `pnpm verify`·`pnpm smoke`·`pnpm e2e`(5 시나리오) 통과. 남은 수용 기준: 구글 OAuth 키 발급 후 실제 구글 계정 가입·로그인 수동 확인(키 대기). 발견한 하네스 결함은 0019(분류 대기).
- 2026-10-06: R17(0021)·R18(0022) 추가·완료.
- 2026-10-06: 구글 실로그인 확인. 사용자가 키를 넣고 로그인. `GET /api/auth/google/start` 200(`accounts.google.com/o/oauth2/v2/auth`, `redirect_uri=http://127.0.0.1:5193/auth/google/callback`, scope `openid email`, `cl_oauth_state` 쿠키). 개발 DB: 사용자 1명(구글 이메일, `OPERATOR_EMAILS`에 따라 role `operator`), `user_identities` provider `google` 1행(재로그인으로 `last_login_at` 갱신), 가입 트랜잭션 결과(랜딩 public_id, 리스트 구역 1개, 단축 주소를 자동에서 직접 지정 주소로 바꿈, 링크 2개), 유효 세션 2개. API 오류 로그 0바이트. 하위 6/6 완료로 에픽 `완료`.
