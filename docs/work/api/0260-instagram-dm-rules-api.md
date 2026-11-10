# 0260 규칙 API·게시물 목록

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

규칙 API·게시물 목록

위험 등급 R2, 담당 Sol medium.

## 수용 기준

- [ ] `... test -- instagram-rules` 통과. 한도, 250자, 게시물 중복 409, 소유자 전용, `/s/` 코드 연결, 캐러셀 처리(S5 결과), 문구 제약 없음; 규칙 수정·비활성화·보관이 `version`을 올리고 `pending`을 취소, 다른 크리에이터의 `publicId`는 404(조회·변경 모두 SQL에 소유자 조건)

## 범위

- 포함: `instagram/rules*.ts`, `creator/creator.module.ts`(export 1줄), `test/instagram-rules.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.

- 2026-11-11: `apps/api/src/instagram/rules.controller.ts`, `rules.service.ts`에 규칙 목록·생성·수정·보관과 게시물 목록을 구현했다. 모든 경로는 `SessionGuard`·`PageAccessGuard`·`@PageOwnerOnly()`·`@ActorKinds('human')`를 적용하며 SQL에 연결 소유자 조건을 포함한다. `creator.module.ts`는 `ChannelLinksService` export만 추가했다.
- 2026-11-11: 생성은 연결 행 잠금으로 규칙 한도·게시물 중복 검사를 직렬화하고, Graph 게시물 소유를 확인한 뒤 기존 `ChannelLinksService`로 `instagram`/`dm` 코드를 먼저 저장한다. 키워드·메시지는 DB `char_length`와 같은 코드 포인트 단위로 30·250자를 검사한다. 캐러셀 자식 ID는 실측 전이므로 빈 배열이다. 실제 내용 변경·비활성화·보관은 같은 트랜잭션에서 version을 올리고 해당 규칙의 pending만 취소한다.
- 2026-11-11: `apps/api/test/instagram-rules.e2e-spec.ts`에 14개 시험을 작성했다. 앱의 `InstagramGraph.listMedia`를 `jest.spyOn(t.app.get(InstagramGraph), 'listMedia')`로 대체하며 실제 Meta를 호출하지 않는다. 생성·코드·`/s/` 연결, 캐러셀, 커서, 입력 길이·문구 무제약, 소유자·사람 권한, 다른 소유자의 404, 활성·총 한도, 동시 중복, version·pending 취소를 포함한다.
- 2026-11-11: `pnpm --filter @crelink/api typecheck` 최종 통과. 최초에는 `Queryable`의 pg overload와 `Database.query` 시그니처 차이로 TS2345, 중간 수정에서는 union 호출의 TS2349가 발생했으며 pool을 조회 대상으로 넘겨 수정했다. `pnpm exec eslint apps/api/src/instagram/rules.controller.ts apps/api/src/instagram/rules.service.ts apps/api/src/creator/creator.module.ts apps/api/test/instagram-rules.e2e-spec.ts` 및 같은 네 파일의 `pnpm exec prettier --check` 통과. `git diff --check` 통과.
- 2026-11-11: `pnpm --filter @crelink/api test -- instagram-rules --runInBand` 최초 실행은 위 TS2345로 suite 컴파일 실패. 수정 후 `pnpm --filter @crelink/api test -- instagram-rules`는 테스트 DB 생성 전 `connect EPERM 127.0.0.1:5852 - Local (0.0.0.0:0)`로 실패했다(14개 모두 beforeAll DB 연결 실패). 이 샌드박스의 localhost DB 접근 제약이며 HTTP·DB 동작 통과 근거가 아니다. 메인 세션에서 DB가 가능한 환경으로 같은 시험을 실행해야 한다.
- 2026-11-11: `pnpm work:scope 0260` 실패. 검사 기준인 `main` 머지 베이스부터 HEAD까지 선행 커밋의 소유 범위 밖 변경 9개(`apps/web` 2개, `docs/product` 1개, `docs/specs` 2개, `infra` 4개)가 포함된다. 이번 작업의 `git diff`와 미추적 파일은 사용자 지정 다섯 파일뿐이다. 지정 범위 밖인 `CHANGELOGS.md`·영역 로그·설계·migration은 수정하지 않았고 변경 내역은 이 진행 기록에 남겼다. 커밋하지 않았다.

## 미해결·통합 판단 자료

- 설계의 “게시물당 활성 1개”와 `0016_instagram_dm.sql`의 `instagram_dm_rules_one_per_media` 인덱스는 범위가 다르다. 현재 인덱스는 `archived_at IS NULL`만 검사하므로 비활성 규칙도 같은 게시물의 새 규칙 생성을 막는다. 실행 가능한 원본을 따라 미보관 중복을 409 `instagram_rule_media_taken`으로 처리했다. 보관 후에는 새 규칙을 만들 수 있다. 인덱스·설계는 소유 범위 밖이므로 그대로 두었다.
- 설계 API 표의 규칙 목록 “상한 10”은 활성 한도 10·총 한도 100 및 비활성 규칙 편집과 모호하다. 공유 계약의 “보관된 규칙은 일반 목록에서 반환하지 않음”에 따라 현재 목록은 비활성을 포함한 미보관 규칙을 총 한도 100까지 반환한다. 최종 목록 상한 해석은 메인 세션에서 확인해야 한다.
- 기존 `ChannelLinksService.create`는 독립 트랜잭션이다. 설계의 코드 선생성 순서를 유지하므로 이후 규칙 INSERT 실패 시 코드가 남을 수 있다. 서비스에 트랜잭션 client를 받도록 바꾸는 것은 지정 범위 밖이어서 변경하지 않았다.
- e2e 미실행으로 수용 기준 체크는 유지한다. 검증 가능한 환경의 DB 시험, 위 설계 충돌 판단과 변경 기록 통합은 메인 세션에서 필요하다.
- 2026-11-11: Claude가 로컬 DB에서 재검증(`pnpm --filter @crelink/api test -- instagram-rules` 14건 통과, typecheck·eslint·prettier 통과). 비활성 규칙도 게시물을 점유하는 것은 설계의 유니크 인덱스대로입니다.
