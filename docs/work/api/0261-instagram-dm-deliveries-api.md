# 0261 발송 내역 API·가용 여부

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

발송 내역 API·가용 여부

위험 등급 R2, 담당 Sol medium.

## 수용 기준

- [ ] `... test -- instagram-deliveries` 통과. 커서, 응답 키에 해시·comment_id 없음; 다른 크리에이터의 `rule` 필터와 내역은 404(SQL에 소유자 조건)

## 범위

- 포함: `apps/api/src/instagram/deliveries*.ts`, `apps/api/src/creator/creator.controller.ts`, `apps/api/src/creator/creator.service.ts`, `packages/shared/src/crelink.ts`의 `CreatorLandingState.instagramDmAvailable` 한 줄, `apps/api/test/instagram-deliveries.e2e-spec.ts`, 이 티켓(사용자 지정 소유 경로).
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.

- 2026-11-11: `GET /api/me/instagram/deliveries` 구현. 사람·페이지 소유자 가드와 SQL의 연결 소유자 조건을 적용하고, 20건 keyset(`common/cursor.ts`)·규칙 publicId 필터·보관 규칙 내역을 지원한다. 다른 소유자·없는 규칙 필터는 404 `instagram_rule_not_found`, 잘못된 필터·커서는 400이다. 응답은 공유 계약의 7개 키만 명시적으로 구성해 `commenter_hash`, `comment_id`, `failure_code`, `message_body`를 제외한다.
- 2026-11-11: `CreatorLandingState.instagramDmAvailable: boolean` 추가. 기존 광고 블록의 `platform_settings` 조회에 audience 조건을 합쳐 조회 횟수를 유지한다. 설정 존재 및 `everyone` 또는 요청 사용자가 운영자인 `operators`일 때 true이며, 편집자도 요청 사용자 기준으로 계산한다. 랜딩 상태를 반환하는 조회·수정 경로 모두 요청 사용자 역할을 전달한다. 웹 메뉴 숨김은 웹 책임이다.
- 2026-11-11: `apps/api/test/instagram-deliveries.e2e-spec.ts` 작성. 미연결·빈 페이지, 20건·마이크로초·동일 시각 id 경계·중간 삽입, 전체 상태·sentAt·응답 키, 규칙 필터·보관·타 소유자 404, 입력 400, 로그인·편집자·AI 차단, audience·요청 역할·공유 페이지·미설정 503을 검사한다. DB에 접근할 수 없는 샌드박스라는 사용자 안내에 따라 e2e는 실행하지 않았다. 메인 세션에서 `pnpm --filter @crelink/api test -- instagram-deliveries` 실행이 필요하며, 수용 기준은 실행 전까지 미체크로 둔다.
- 2026-11-11: `pnpm --filter @crelink/shared build`, `pnpm --filter @crelink/api typecheck` 통과. 변경한 TypeScript 6개 파일에 대한 `pnpm exec eslint <변경 파일>` 및 `pnpm exec prettier --check <변경 파일>` 통과. `git diff --check` 통과.
- 2026-11-11: `pnpm typecheck`는 design-tokens·shared·API·app까지 통과하고 web에서 실패(종료 코드 2). `apps/web/src/lib/landing-preview.spec.ts:72`의 `CreatorLandingState` fixture에 필수 필드 `instagramDmAvailable`이 없어 TS2322가 발생한다. 사용자 지정 소유 경로 밖이므로 수정하지 않았으며, 메인 세션에서 기본값 `false` 추가가 필요하다.
- 2026-11-11: `pnpm work:scope 0261` 실패(종료 코드 1). 기준 main 이후 기존 커밋에 웹·인프라·설계 등 타 영역 변경 22개가 포함된다. 이번 작업만 대상으로 한 `pnpm work:scope 0261 --base HEAD`는 통과했다. 사용자 지정 경로 밖은 수정하지 않았고, 이에 따라 루트·API `CHANGELOGS.md` 갱신도 메인 세션에 인계한다. 커밋하지 않았다. 설계와의 충돌은 발견하지 않았다.
- 2026-11-11: Claude가 로컬 DB에서 재검증(`pnpm --filter @crelink/api test -- instagram-deliveries` 13건 통과, API typecheck·eslint·prettier 통과).
