# 출시 준비와 PR 브라우저 QA

- 상태: 구현·localhost/PR CI 검증 완료, 미배포
- 작성일: 2026-11-06
- 근거: 사용자 명시 요청은 기존 출시 준비·자동 QA 연결과 카드2열, localhost 검증, review 가능한 draft PR까지다. main 병합·배포·신규 기능 구현·주기 자동화 변경은 포함하지 않는다.
- 연결: [0200 실행·결과](../work/orchestrator/0200-release-qa.md), [PRD](../product/crelink.md), [디자인 기준](../../design/system/DESIGN.md), [E2E 계약](../../tests/e2e/README.md).

## 기준과 현재 기능

| 영역 | 실행 가능한 원본 | 이번 요구와 구분 |
| --- | --- | --- |
| 인증·편집·공개 | `apps/api/src/auth/`, `apps/api/src/creator/`, `apps/web/src/components/me/` | 기존 Google OAuth·링크50개·저장된 콘텐츠를 유지한다. 별도 초안/발행 버전 기능을 가정하지 않는다. |
| 링크 배치 | [설계](link-grid-layout.md), `apps/web/src/styles.css` | 기본 리스트와 기존 list/grid 계약 유지. 최신 지시로320px 이상 카드2열이며0199의3열은 과거 이력이다. 새 migration·API·shared 필드가 필요 없다. |
| 본인/관리자 분석 | [설계](crelink-analytics.md), `packages/shared/src/analytics.ts` | 과거 MVP의 내부 전용 제외 문구보다 후속 R10·R28과 현재 권한 구현을 따른다. 실제 방문·클릭과 본인 수치를 검증한다. |
| Instabio 가져오기 | [설계](instabio-import.md), `apps/api/src/creator/` | 기존 링크·프로필·배치 선택을 의도 없이 덮어쓰지 않는다. 외부 원본 fixture는 실제 제공자 가용성 증명이 아니다. |
| PR gate | `.github/workflows/ci.yml`, `scripts/e2e.mjs` | 기존 required `CI 통과`의 smoke 의존성 안에 실제 브라우저 검사를 연결한다. YAML 연결만으로 CI 성공이라고 보고하지 않는다. |

## 요구 대응과 분담

| 요구 | 구현·검증 | 소유 |
| --- | --- | --- |
| 카드2열·기본 리스트·선택 저장·새로고침 | 공통 렌더러 CSS, 기존 link-layout 3엔진 | web 구현, QA 시험 |
| 첫 링크 저장→공개 조회→방문/클릭→본인 통계 | 실제 localhost API/PostgreSQL과 합성 세션, DB/응답/화면 대조 | QA |
| 타 계정·만료 세션·저장 실패/재시도·가져오기 보존 | 기존 fixture/시나리오 재사용 및 필요한 release 시나리오 | QA; 결함은 해당 production 소유자에게 인계 |
|320/390/768/1280·회전/확대·키보드 | analytics-responsive/link-layout 및 최소 추가 검사 | QA |
| 최소 시각·접근성 회귀 | 안정된 공개 화면 screenshot과 axe, 실제 실패를 gate에 전달 | QA 시험, PM dependency/CI |
| 실패 증거·필수 gate 음성/정상 확인 | HTML/JSON/PNG/trace artifact, Actions job·필수 check 결과 | PM |

shared 계약은 선행 확정된 `list/grid`를 재사용한다. 별도 API worker는 실제 API 결함이 확인될 때만 필요하다. web/QA의 파일 소유는 비중첩이고 QA가 통합 인스턴스·DB·브라우저 런타임을 단독 소유한다. QA 인수 뒤 PM이 최종 verify/smoke/scope와 PR CI를 실행한다. Orca Task/Dispatch와 실행 결과는0200의 진행 기록이 원본이다.

## CI와 기준선

기존 smoke job의 고정 `ubuntu-24.04`, `.nvmrc` Node, lockfile Playwright1.64.0을 사용한다. 동일 localhost PostgreSQL17/API/웹에서 smoke·핵심 Chromium·personas·분석3엔진·배치3엔진을 순차 실행한다. 별도 원격 연결 허용이나 localhost guard 예외를 추가하지 않는다.

Instabio 검사는 API 프로세스에만 `CRELINK_E2E_INSTABIO=1 NODE_OPTIONS="--import <checkout>/tests/e2e/instabio-source.mjs"`를 주입한다. 네 대상 주소를 모두 루프백으로 검증한 뒤 정확한 합성 외부 원본2개 URL의 fetch만 대체하며 내부 API/DB는 실제 실행한다. 일반 개발·제품 Docker 이미지·운영 설정에는 주입하지 않는다. 성공은 가져오기 보존 계약의 증거이지 Instabio live 가용성의 증거가 아니다.

각 suite는 `.local/ci/e2e/<suite>/` 아래 HTML/JSON과 실패 PNG/trace를 만든다. `always()` artifact는 해당 경로·smoke 결과·API/웹 로그만 업로드하며 환경 파일·운영 자격은 포함하지 않는다. trace에는 수명이 끝난 localhost 합성 세션 정보가 포함될 수 있으며 실제 사용자 세션을 사용하지 않는다. 보관 기간14일. 실패는 기존 smoke job과 그 결과를 받는 required `CI 통과`를 실패시켜야 한다.

시각 baseline은 Linux Chromium 한정 고정 viewport·합성 콘텐츠·폰트 준비·움직임 정지 조건으로 최소화한다. 첫 CI의 missing-baseline은 성공이 아니라 의도된 중간 실패다. 실제 PNG를 열어 카드2열·긴 제목·이미지·배너·폭을 검토하고 올바른 기준선만 수동 등록한다. 같은 실패 run에서 artifact·필수 check 실패를 관측하고 기준선 추가 뒤 정상 최종 SHA의 성공을 확인해야 음성→복원 시험이 완료된다. 불일치·접근성 오류를 skip하거나 허용치를 늘려 통과시키지 않는다.

## 미검증 경계와 복구

fixture는 실제 OAuth가 아니다. 외부 목적지 mock은 리디렉트 주소 검사이며 외부 사이트 정상 증명이 아니다. Chromium/WebKit/Firefox와 모바일 emulation은 실물 iPhone/Android·Instagram 인앱 성공 증명이 아니다. 실제 Google OAuth·인앱·실물은 별도 `not-run`으로 남기고 기기/OS/버전·계정 권한이 확보될 때 명시적으로 검증한다.

뜻하지 않은 제품 실패는 담당 경로에서 수정 후 재검증한다. 미해결 실패는 failed/blocked로 유지한다. 코드 rollback은 해당 커밋 revert이며 기존 콘텐츠·DB 데이터를 지우지 않는다. CI 음성시험은 PR 브랜치에서만 수행하며 main·Deploy·운영 요청을 발생시키지 않는다.

## 후속 기능 우선순위 제안

아래는 사용자 확정 구현 범위가 아닌 비교 제안이다. 이번 PR에 구현하지 않는다.

| 순위 제안 | 후보·근거 | 완료 기준 후보 | 선택/보류 이유 |
| --- | --- | --- | --- |
|1 | 첫 페이지 완성 안내: 기존 첫 링크·가져오기·공개 확인 경로 연결 | 빈 계정의 다음 행동, 기존 콘텐츠 보존, 저장 성공/실패 구분, 안내를 닫아도 편집 가능 | 첫 가치 경로와 가장 가깝고 기존 안내를 재사용할 수 있다. 실제 사용자 병목은 아직 미검증이다. |
|2 | QR/공유 준비: 기존 단축 주소 복사 보강 | QR의 실제 주소 일치·다운로드, 공개 메타데이터 점검, 공유는 선택 | 실제 배포/외부 공유와 혼동 없이 검증할 수 있다. 외부 서비스 캐시는 별도 위험이다. |
|3 | 소수 스타일 프리셋 | 기존 콘텐츠/list-grid 선택 보존·접근성 대비·저장/복원 | 선택 부담과 토큰/상태 조합이 늘므로 실제 수요 확인 뒤 사용자 결정이 필요하다. |
|4 | 예약 링크 | 시작/종료·시간대 경계·기간 밖 노출·실패/복구 | 서버 시간·스케줄·동시성 계약이 필요하므로 이벤트 수요가 확인된 뒤 설계한다. |

이 순위는 수요·전환 개선의 실측 결과가 아니다. 합성 QA 완료율을 활성화·성장 성과로 사용하지 않는다.
