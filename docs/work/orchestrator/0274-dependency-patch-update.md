# 0274 PR #166 의존성 minor·patch 갱신 통합

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 유지보수
- 우선순위: P2
- 작성일: 2026-11-11

## 목적

사용자 승인 순서 #178 → #166 → #161에 따라 Dependabot 의존성 갱신을 최신 main에 통합하고 기존 기능의 회귀를 검증합니다.

## 수용 기준

- [ ] 기존 PR의 manifest·lockfile 갱신을 유지하고 `pnpm install --frozen-lockfile`로 일관성을 확인합니다.
- [ ] #178이 반영된 최신 main에서 Node 24 `pnpm ci:local`이 통과합니다.
- [ ] push 후 같은 SHA의 `pnpm ci:local --report`와 최종 양측 검수 게이트를 통과한 뒤 squash merge합니다.
- [ ] 해당 merge SHA의 Deploy 실행 결과를 확인합니다.

## 범위

- 포함: Playwright 1.65.0, typescript-eslint 8.72.2, AWS S3 SDK 3.1165.0, NestJS common·core·platform-express·testing 12.4.2, google-auth-library 11.3.4, marked 18.2.0, Next.js 16.4.6과 lockfile 재해결, 변경 기록·검증. manifest의 호환 범위 내 Expo·간접 의존성 해제 버전도 원래 PR lockfile에 포함됩니다.
- 제외: 새 기능, 의존성 major 갱신, 예약 #157, 실기기 검증, 운영 직접 시험.

## 위험·복구

NestJS·Next.js·인증 라이브러리 갱신으로 런타임 회귀가 생길 수 있어 전체 로컬 CI로 확인합니다. 실패 시 머지하지 않습니다. 머지 뒤 CD 실패는 저장소 자동 롤백·런북을 따릅니다. DB 스키마·개인정보 계약·외부 서비스 설정 변경은 없습니다.

## 연결

- [PR #166](https://github.com/ai-worker-lab/crelink/pull/166)
- [로컬 CI](../../development/verification.md#로컬-ci)
- [의존성 정책](../../development/repository-policy.md#의존성-버전)

## 진행 기록

- 2026-11-11: 원래 Dependabot 브랜치에서 준비(기존 PR 브랜치명 유지). 제품 코드 수정 없이 manifest·lockfile을 검증합니다. 원본 실행 로그는 Git 밖 `/tmp/crelink-pr166-*.log`에 둡니다.
