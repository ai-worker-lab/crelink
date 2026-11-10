# 0254 migration(위 스키마)·모듈 뼈대·설정(`META_*` 키)·암호화·v27.0 상수·Sentry(`E

- 단계: 티켓
- 역할: api
- 상위: 0251
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

migration(위 스키마)·모듈 뼈대·설정(`META_*` 키)·암호화·v27.0 상수·Sentry(`EAA` 스크럽)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [ ] `pnpm --filter @crelink/api test -- "health|migrations|instagram-crypto|sentry"` 통과. 복호화 AAD 위조 실패, 부분 설정 기동 거부, 토큰 스크럽 시험; Graph 오류 코드·서브코드만 로그에 남고 원문 오류는 버려지는 시험; `INSTAGRAM_OPT_OUT_KEY`를 포함한 부분 설정 기동 거부

## 범위

- 포함: `apps/api/migrations/0016_instagram_dm.sql`, `apps/api/src/instagram/{instagram.module,crypto,graph,빈 controller·service}.ts`, `config.service.ts`, `app.module.ts`, `monitoring/sentry.ts`, `.env.example`, `docs/**`, `test/health.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
