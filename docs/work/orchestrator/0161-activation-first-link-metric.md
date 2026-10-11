# 0161 가입 후 첫 공개 링크 활성화 지표

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-11

## 목적

가입 수만으로는 Crelink 활성화를 판단할 수 없으므로, 지표 대상 사람 크리에이터가 처음 공개 링크를 만든 흐름을 운영자 화면에서 확인합니다. 새 분석 SDK·식별자·유료 도구 없이 기존 `links.created_at`과 공개 링크 조건만 사용합니다.

## 수용 기준

- [x] 사용자별 첫 공개 링크를 중복 없이 계산합니다.
- [x] 최근 7일·30일 창을 분리하고 숨김·차단 링크와 지표 제외 계정을 제외합니다.
- [x] 공유 계약·API·운영자 화면·지표 명세를 같은 이름으로 맞춥니다.
- [x] 기존 지표 필드와 이벤트 수치를 유지합니다.
- [x] localhost 회귀 검증, PR CI, main Deploy와 `links.shaul.kr` 확인을 기록합니다.

## 변경 범위

- `packages/shared/src/crelink.ts`: `AiOperatorMetrics.activation` 계약
- `apps/api/src/ai-operator/metrics.service.ts`: 사용자별 `min(links.created_at)` 집계
- `apps/api/test/agent-runs.e2e-spec.ts`: 빈 상태·7/30일 경계·제외 조건 회귀
- `apps/web/src/app/admin/agent-runs/page.tsx`: 운영자 지표 카드
- `docs/specs/crelink-ai-operator.md`: 지표 정의·화면 계약

## 안전·비용

비용 지출, 결제, 광고, 외부 홍보, 외부 분석 서비스, 사람 계정 변경, 운영 DB 직접 쓰기를 실행하지 않습니다. 로컬 테스트 DB만 사용하며 토큰·비밀값·개인 식별 원문은 기록하지 않습니다.

## 로컬 검증

- `../../node_modules/.bin/jest --runInBand test/agent-runs.e2e-spec.ts` (apps/api): 8 tests passed.
- `../../node_modules/.bin/tsc --noEmit -p tsconfig.json` (apps/api): passed.
- `../../node_modules/.bin/next typegen && ../../node_modules/.bin/tsc --noEmit` (apps/web): passed.
- `node scripts/work.mjs --check && node scripts/docs-check.mjs`: passed.
