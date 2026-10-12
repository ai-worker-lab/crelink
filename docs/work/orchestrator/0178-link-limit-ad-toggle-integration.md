# 0178 링크 한도·광고 블록 스위치 통합

- 단계: 티켓
- 역할: orchestrator
- 상위: 0175
- 선행: 0176, 0177
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-12

## 목적

에픽 0175의 계약을 먼저 확정하고, API·웹 티켓을 한 통합 브랜치 `work/0178-link-limit-ad-toggle`에 모아 실제 API·DB·브라우저로 검증합니다. 설계·PRD·E2E·변경 기록을 맞춥니다.

## 수용 기준

- [x] 설계 문서 `docs/specs/crelink-link-limit-ad-toggle.md`, PRD R13·R20 ⑩·R24(철회), 관련 설계(`crelink-mvp.md`·`crelink-ad-banner.md`·`crelink-ai-operator.md`·`crelink-slot-event.md` 대체됨)가 구현과 맞음. `pnpm docs:check` 통과.
- [x] E2E가 바뀐 한도·광고 스위치를 따르고 링크 슬롯 이벤트 시나리오가 없음.
- [x] `pnpm verify`, `pnpm smoke` 통과.
- [x] 로컬 브라우저 시나리오: (a) 보이는 링크 6개 이상에서 50개까지 추가, 51번째 거절 (b) 플랫폼 꺼짐 → `/p/{id}` 광고 없음·편집 화면 광고 줄 없음 (c) 플랫폼 켬 + 크리에이터 끔 → 광고 없음 (d) 둘 다 켬 → 광고 보임 (e) 배너 슬롯 부여 크리에이터는 그대로.
- [x] PR 하나, CI 통과. main 머지는 하지 않음(부모 결정).

## 범위

- 포함: 공유 계약 확정, 문서·E2E·변경 기록, 통합 검증, PR.
- 제외: main 머지·운영 배포.

## 위험·복구

에픽 0175 `위험·복구`와 같습니다.

## 연결

- 설계: [기술 설계](../../specs/crelink-link-limit-ad-toggle.md) `검증 계획`

## 진행 기록

- 2026-10-12: 생성. 착수(브랜치 `work/0178-link-limit-ad-toggle`, 기준 origin/main `11f503e`). 공유 계약을 먼저 확정했습니다.
- 2026-10-12: 0176(api)·0177(web)을 각 역할 agent에 병렬로 맡겨 같은 브랜치에 통합했습니다. 두 agent의 첫 편집 몇 건이 상대 경로로 주 checkout에 써져 각자 worktree로 옮기고 주 checkout을 되돌렸습니다(주 checkout `git status` 깨끗함 확인). 문서: 설계 `crelink-link-limit-ad-toggle.md`(승인), PRD R13 변경·R20 ⑩ 추가·R24 철회, MVP·광고 배너·AI 운영자 설계 변경 기록, 링크 슬롯 이벤트 설계·디자인 인계 `대체됨`, 운영 헌장·로드맵·사람 할 일·모집 문안 사실 갱신, `scripts/ai-operator.mjs`의 지표 `events` 출력 제거. E2E: `slot-event.spec.ts`·프로젝트 제거, `creator`(6개 이상·숨김 포함 50개·51번째 409), `operator`(슬롯 부여 없이 6번째), `ad-banner`(두 스위치 (b)~(e), 파일 시작·끝 플랫폼 꺼짐 복구), `ai-operator`(AI 쓰기 예시를 배너 슬롯 부여로).
- 2026-10-12: 검증(Node 24.20.0, 인스턴스 슬롯 1 `make up`). `pnpm verify` 8단계 통과(첫 실행은 `docs:check` 0168 진행 기록의 지운 파일 링크 2건·`lint` Prettier 1건 실패 → 링크를 코드 표기로 바꾸고 서식 수정 뒤 통과), `pnpm smoke` 5건 통과, `pnpm e2e` 17건 통과(main 9·ad-banner 4·personas 4). 시스템 기본 Node 22.23에서는 API jest가 ESM `require` 오류로 돌지 않아 `.nvmrc`의 24로 실행했습니다.
- 2026-10-12: 로컬 브라우저(Playwright, 1280px, 합성 계정 `@manual.crelink.test` 3개를 DB fixture로 만들고 끝에 지움): (b) 플랫폼 꺼짐 → `/p/manuala001` 광고 영역 0, 편집 화면 광고 행·`광고 블록 표시` 스위치·미리보기 광고 칩 0 / (a) 보이는 링크 5개에서 UI로 6번째 추가 `링크 6/50` → BFF로 7~50번째 44건 201 → 51번째 409 `link_total_limit_reached` → 편집 화면 `링크 50/50`·추가 버튼 0·한도 안내 1, 공개 랜딩 보이는 링크 50 / 운영자 `광고 블록 사용` 스위치 켬(카드에 바꾼 운영자 이메일) / (c) 크리에이터 꺼짐 → 공개 광고 0, 편집 화면 광고 행 1·스위치 `aria-checked=false`·미리보기 칩 0 / (d) 크리에이터 켬 → 미리보기 칩 1, 공개 랜딩 맨 뒤 `크리링 광고`(배너 alt `수동 확인 광고`) / (e) 배너 슬롯 부여 크리에이터 B: 플랫폼 켬·B 스위치 끔에서 크리에이터 배너 1·광고 0·편집 화면 광고 스위치 0, 플랫폼 끈 뒤에도 크리에이터 배너 1 / 플랫폼 끈 뒤 A(스위치 켬)도 공개 광고 0·편집 광고 행 0. 390px에서 `/admin/ad-banners`·페이지 편집 가로 넘침 0. DB: 그 배너 노출은 (d) 1회만(꺼진 동안 기록 없음), 행동 기록 `platform.ad_block` 2행(false→true, true→false). 콘솔 오류는 가짜 `.test` 링크 아이콘 로드 실패(설계상 기본 아이콘 대체)뿐입니다.
- 2026-10-12: [PR #132](https://github.com/ai-worker-lab/crelink/pull/132), 커밋 `250b6fe`의 CI [38194497224](https://github.com/ai-worker-lab/crelink/actions/runs/38194497224) `CI 통과` 성공(check Node 24·26, smoke, 이미지 빌드 api·web, work scope). main 머지·배포는 하지 않았습니다(부모 세션 결정).
