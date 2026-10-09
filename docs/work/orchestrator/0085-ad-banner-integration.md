# 0085 광고 블록 통합·E2E·main 머지

- 단계: 티켓
- 역할: orchestrator
- 상위: 0063
- 선행: 0070, 0071, 0072, 0073, 0074, 0081, 0082, 0084
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T17입니다. 요구는 R20, R21입니다.

## 수용 기준

- [ ] 통합 브랜치를 main에 한 번 머지합니다. 그 전에: 전체 `pnpm verify`, 실제 API로 E2E `tests/e2e/ad-banner.spec.ts`(아래 검증 계획), mock 제거, E2E 정리 순서. 운영 주소 검사 `infra/prod/verify.sh`에 `{SHORT}/b/zzzzzzzzzz`(와 `/a/zzzzzzzzzz/zzzzzzzzzz`)가 302 `…/notice?reason=link_unavailable`인지 더합니다(T8이 main에 들어간 뒤). `docs/specs/crelink-prod-deploy.md`의 구성도·공개 경로 줄, 변경 기록, 릴리스 노트도 고칩니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T17
- 요구: [PRD](../../product/crelink.md#요구사항) R20, R21
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 통합 검증(orchestrator, 브랜치 `work/0085-ad-banner-integration`, Node 24.20, `set -o pipefail`).
  - 인스턴스: 슬롯 0(Compose project `crelink`, API 3020·웹 5193)의 API·웹을 `make api-restart web-restart`로 이 브랜치 코드로 다시 띄웠습니다. migration `0001`~`0003_ad_banner`가 적용되어 있습니다.
  - E2E `tests/e2e/ad-banner.spec.ts`: 설계 검증 계획 1~9를 테스트 4개(무료 랜딩, 운영자 크리링 배너, 배너 슬롯, 방명록·반응형)로 실제 API·DB에서 확인합니다. mock은 없고, 운영자 화면의 `window.confirm`만 수락합니다. 시나리오별 확인 내용은 [E2E README](../../../tests/e2e/README.md#시나리오)에 있습니다.
  - E2E 정리: `tests/e2e/fixtures.ts` `removeUsers`가 사용자보다 그 사용자의 이미지를 쓰는 `ad_banners`를 먼저 지웁니다(이미지 FK RESTRICT). 이 spec은 시작할 때 시험 운영자가 남긴 크리링 배너도 지웁니다.
  - 실제 연결에서 드러난 결함과 수정
    1. 슬롯이 링크 목록 맨 앞(빈 랜딩 포함)이면 관리 미리보기의 슬롯 칩(`광고 블록 · 위치 이동`)이 바깥 `외부 링크 · 편집` 칩과 같은 자리에 겹쳐 그 칩을 누를 수 없었습니다. 기존 `creator.spec.ts`가 2분 시간 초과로 실패해 드러났습니다. 맨 앞일 때만 슬롯 칩을 왼쪽 위에 둡니다(`apps/web/src/styles.css`, 웹 소유).
    2. 크리링 배너는 전역 데이터라, 광고 시나리오와 다른 E2E가 동시에 돌면 광고가 다른 화면에 끼어듭니다. 또 시험이 끝나며 지운 배너 이미지가 열린 화면에서 404 콘솔 오류가 되어 `operator.spec.ts`가 실패했습니다. `tests/e2e/playwright.config.ts`를 프로젝트 `main`·`ad-banner`(main 뒤 실행)로 나눴습니다.
    3. 기존 E2E가 광고 행을 몰랐습니다. `creator.spec.ts`의 외부 링크 패널 제목 목록에서 광고 행을 빼고, 키보드 안내의 전체 개수를 7로 바꿨습니다(링크 6 + 광고 행).
  - 운영 주소 검사: `infra/prod/verify.sh`에 `{SHORT}/b/zzzzzzzzzz`·`/a/zzzzzzzzzz/zzzzzzzzzz`가 302 `{WEB}/notice?reason=link_unavailable`인지 더했습니다(검사 4개). `bash -n`·`shellcheck -x`를 통과했고, 로컬 API에서 두 주소 모두 302 `…/notice?reason=link_unavailable`입니다. 0074 이후 `infra/prod/tests/caddy-routing.sh`는 통과 78, 실패 0입니다.
  - 문서: `docs/specs/crelink-prod-deploy.md`(구성도·단축 호스트 공개 경로·운영 주소 검사 표·변경 기록), `docs/development/verification.md` CD 표, `infra/prod/README.md`·`infra/docs/prod-runbook.md` 검사 수, `tests/e2e/README.md`, 광고 설계 `변경 기록`, 루트·웹·인프라 `CHANGELOGS.md`를 고쳤습니다. `RELEASES.md`는 사용자에게 공개한 릴리스만 적는 규칙이라 바꾸지 않았습니다. 버전·tag를 붙인 공개 릴리스가 아직 없습니다.
  - 0067~0084는 각 진행 기록에 이 통합 근거를 적고 `완료`로 바꿨습니다(0076은 이미 `완료`). 에픽 0063 수용 기준 7개를 체크했습니다.
  - 검사 결과(모두 실제 실행): `pnpm verify` 8단계 모두 통과(tokens·work·docs·design·lint·typecheck·build·test, API 23 suites 175/175, 웹 단위 44/44, shared 55/55). `pnpm smoke` 5/5, `pnpm e2e` 12/12(`main` 8 + `ad-banner` 4), `pnpm work:check` 통과(work item 85개).
  - 남은 위험·미확인
    - 손가락 스와이프·iOS 인앱 브라우저·VoiceOver는 설계대로 기기 수동 확인 몫입니다.
    - 배너 이미지 로드 실패 건너뛰기는 0077 mock 확인까지만 했습니다.
    - 크리에이터 배너 폼에서 GIF를 올리는 경로는 E2E가 없습니다(같은 `ImageField`·API 규칙을 운영자 경로로 확인).
    - 보존 작업(`creator_banner_clicks` → rollups)은 API 통합 테스트로만 확인했습니다.
    - 운영 첫 배포의 migration 0003은 expand 방식(`lock_timeout 5s`)이라 잠금을 못 잡으면 새 색만 실패하고 활성 색은 그대로입니다.
  - main 머지와 배포 뒤 확인(운영 주소 검사 결과)은 부모가 합니다. 그 전까지 수용 기준의 `main 한 번 머지`는 체크하지 않습니다.
