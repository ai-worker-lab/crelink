# 0265 발송 내역 화면

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

발송 내역 화면

위험 등급 R2, 담당 Sol medium.

## 수용 기준

- [x] 실제 BFF 경로로 발송 내역 조회, 20건씩 더 보기와 규칙 필터
- [x] 스켈레톤·빈 안내·오류 재시도, 7개 상태의 라벨, 소유자 전용 403 안내
- [x] 순수 함수 시험과 타입 검사, 변경 코드 eslint·prettier
- [ ] 메인 세션 브라우저 확인과 웹 전체 시험 재실행(샌드박스 포트 제한 해제 환경)

## 범위

- 포함: `.../instagram/deliveries/page.tsx`, `components/manage/instagram-deliveries/**`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 0265 구현. 기존 `.ig-*`·목록·스켈레톤 스타일을 재사용했으며 CSS와 설정 화면은 수정하지 않았습니다. 내역의 생성/발송 시각, 규칙 필터, 커서 더 보기, 추가 조회 실패 시 기존 행 보존을 구현했습니다. 필터 변경 시 목록을 초기화하고 이전 요청을 중단·무시합니다. mock 없이 `browserApi`의 실제 BFF 경로를 사용하지만 실제 API 응답과 브라우저는 미확인입니다.
- 2026-11-11: `pnpm --filter @crelink/web test` 실패: 135개 중 133개 통과(신규 순수 함수 시험 3개 포함), 기존 `src/lib/api/agent-proxy.spec.ts:167`, `:202`의 2개 시험은 `Error: listen EPERM: operation not permitted 127.0.0.1`(code `EPERM`, errno `-1`, syscall `listen`, address `127.0.0.1`)로 실패했습니다. 샌드박스의 포트 바인딩 제한이며 전체 통과로 보고하지 않습니다.
- 2026-11-11: `pnpm --filter @crelink/web typecheck` 통과. 변경 TypeScript 파일의 `pnpm exec eslint` 통과. 변경 파일 `pnpm exec prettier --check` 통과. `pnpm docs:check` 통과(Markdown 359개). `git diff --check` 통과. `node --test apps/web/src/components/manage/instagram-deliveries/state.spec.ts`로 신규 시험 3개 단독 실행도 통과했습니다.
- 2026-11-11: `pnpm work:scope 0265` 실패: `main` 머지 베이스부터 포함된 선행 커밋의 API·공유 계약·인프라 등 소유 경로 밖 변경 53개를 감지했습니다. 이번 작업은 사용자가 지정한 화면·컴포넌트·설계·티켓만 수정했습니다. 설계 수정은 사용자가 허용했으나 일반 web 역할 검사에서는 허용하지 않는 경로입니다.
- 2026-11-11: 설정 화면에서 내역으로 가는 링크는 아직 없습니다. 사용자 지시대로 설정 화면과 영역 변경 기록은 소유 범위 밖이라 수정하지 않았습니다. 메인 세션에서 링크와 `apps/web/CHANGELOGS.md` 기록을 반영해야 합니다. 브라우저 확인·커밋은 메인 세션에 맡깁니다.
- 2026-11-11: Codex Sol medium 구현. Claude가 웹 시험·typecheck·eslint·prettier 재실행. 브라우저 확인은 통합 QA에서 합니다.
