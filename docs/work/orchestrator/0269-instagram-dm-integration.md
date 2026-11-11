# 0269 통합·독립 QA·꺼진 상태 배포 확인

- 단계: 티켓
- 역할: orchestrator
- 상위: 0251
- 선행: 0253, 0254, 0255, 0256, 0257, 0258, 0259, 0260, 0261, 0262, 0263, 0264, 0265, 0266, 0267, 0268, 0271, 0272
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

통합·독립 QA·꺼진 상태 배포 확인

위험 등급 R3, 담당 Opus high(`crelink-qa` 별도).

## 수용 기준

- [ ] `pnpm ci:local --report` 통과, QA 합격, 수신 거부 시나리오, 배포 후 `audience=off`에서 웹훅 GET 응답. A2·A4 뒤 회사 계정 1건 실발송 확인(A4는 S2 재검증 뒤)

## 범위

- 포함: `tests/e2e/**`, `docs/reviews/**`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 사용자 요청으로 처리방침·약관의 발송 설명에서 ‘문구와 링크’ 잔존 표현이 없고 ‘작성한 문구 그대로’가 반영되어 있음을 확인했습니다. 처리방침의 이용 목적에 남은 ‘지정한 링크를 담은 DM’도 같은 설명으로 정정하고 루트·웹 변경 기록에 반영했습니다. `pnpm verify --fast` 6단계 통과(실패 0, 건너뜀 0, 14.7초), `pnpm work:scope 0269`·`git diff --check` 통과. 기존 Next.js 이동 방식 lint 경고 2건과 로컬 OpenDesign 부재에 따른 `od lint` 생략 안내가 있으며 브라우저·통합 테스트·실발송은 이번 확인에서 실행하지 않았습니다.
- 2026-11-11: 생성.
- 2026-11-11: 사용자 요청으로 DM 자동 접미사(채널 링크·자동 발송·수신 거부 안내)를 제거합니다. 저장된 `rule.message` 그대로 발송하며 편집기 안내를 제거하고 본문 일치 회귀와 PRD·설계·영역 로그를 갱신합니다.
- 2026-11-11: QA 재현 결함 7건(R11b·R8b·C1·C3·C2·C4·R12)을 수정했습니다. 설계 문서·처리방침·약관·변경 기록을 맞췄습니다. 검증 결과는 이 브랜치의 커밋과 보고에 있습니다.

- 2026-11-11: DM 접미사 제거 검증: `pnpm --filter @crelink/api typecheck`, `pnpm --filter @crelink/web typecheck`, 변경 TypeScript 3개 파일의 `pnpm exec eslint`, `pnpm docs:check`, `pnpm work:check`, `pnpm work:scope 0269`, `git diff --check` 통과. ego-browser로 로컬 규칙 편집기에서 안내 제거·글자 수 갱신·Tab 이동·취소를 확인했고 1280px·390px 가로 넘침과 관찰 중 콘솔 오류가 없었습니다(저장·실발송 없음).
- 2026-11-11: 실행 제약: `pnpm --filter @crelink/api test --runTestsByPath test/instagram-webhook.e2e-spec.ts test/instagram-worker.e2e-spec.ts test/instagram-opt-out.e2e-spec.ts --runInBand`는 DB `127.0.0.1:6652` 연결 `EPERM`으로 3 suite·206건 실패(초기화 실패), `pnpm --filter @crelink/web test`는 160건 통과·로컬 포트 바인딩 `EPERM`으로 2건 실패. `pnpm smoke`는 API·웹 연결 `EPERM`으로 실행 전 중단. `pnpm verify`는 tokens·work·docs·design 검사 통과 후 기존 작업 트리의 `apps/api/src/app.setup.ts:14` 명시적 `any` 오류 3건으로 lint 실패했으며 이후 typecheck·build·test 단계는 건너뛰었습니다(영역 타입 검사는 별도로 통과). 통합 테스트·전체 검증 통과로 보고하지 않습니다.
- 2026-11-11: 사용자 요청 재확인: `webhook.service.ts`의 `rule.message` → `message_body`, `worker.service.ts`의 발송 인수, `graph.ts`의 `message.text`를 대조해 저장된 규칙 본문에 채널 링크·자동 발송 표시·수신 거부 안내를 자동 첨부하지 않음을 확인했습니다. `RuleEditor.tsx`·약관·처리방침의 자동 첨부 안내 제거와 기존 본문 일치 회귀 코드를 확인했습니다. `pnpm verify --fast`는 6단계 모두 통과(실패 0, 건너뜀 0, 14.4초), `pnpm work:scope 0269`·`git diff --check`도 통과했습니다. 기존 Next.js 이동 방식 lint 경고 2건은 남아 있으며, 이번 확인에서 통합 테스트·브라우저·실발송은 재실행하지 않았습니다.
- 2026-11-11: 사용자 요청으로 `RuleEditor.tsx`의 생성(POST)·수정(PATCH) 요청을 재확인했습니다. 작업 트리에 이미 `message.trim()` 제거가 반영되어 있어 기존 코드를 유지하고, 앞뒤 개행·공백을 포함한 `message` 원문 전송을 루트·웹 변경 기록에 명시했습니다. `pnpm verify --fast` 6단계 통과(실패 0, 건너뜀 0, 14.6초), `pnpm work:scope 0269` 통과. 기존 lint 경고 2건이 있으며 브라우저·통합 테스트·실발송은 이번 확인 범위에 포함하지 않았습니다.
