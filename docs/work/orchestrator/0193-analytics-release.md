# 0193 방문자 수집·지표·통계 운영 배포

- 단계: 티켓
- 역할: orchestrator
- 선행: 0188
- 상태: 진행
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-06

## 목적

사용자의 명시적 요청 “배포하라”에 따라 로컬 검증을 마친 방문자 수집과 관리자 통합·크리에이터 본인 지표/통계를 운영에 반영한다. 이 요청으로 필요한 commit·push·PR·main 병합과 기존 CD 실행을 진행한다.

## 수용 기준

- [x] 검증한 변경만 커밋하고 비밀값 검사를 통과한 브랜치의 원격 HEAD를 확인한다.
- [x] 최신 main 기준 PR 검사를 통과하고 병합한다.
- [ ] 해당 커밋의 API·웹 이미지, home-server 배포와 운영 주소 검사, 배포 기록 태그를 확인한다.
- [ ] 실제 환경·커밋·시각·검증 범위와 미실행 범위를 기록하고 로컬·원격 상태를 확인한다.

## 범위

- 포함: 0181 방문자 수집, 0188 지표·통계의 검증된 변경과 Next 보안 패치, 사용자 릴리스 노트, 기존 운영 배포 절차.
- 제외: 인증 방식 변경, 운영 방문자 원본 조회·시험 데이터 생성, 인프라 재설계, 인증정보 복사, 배포와 무관한 수정.

## 위험·복구

0009·0010은 테이블·컬럼을 추가하는 확장 migration이며 기존 데이터를 삭제하지 않는다. 새 색의 API는 migration과 readiness를 통과한 뒤 트래픽을 받는다. 적용 후 옛 API로 롤백해도 추가 스키마는 남는다. 배포·검증 실패 시 기존 Blue/Green 자동 복구 절차를 따른다. 운영 DB의 수동 삭제·역 migration은 하지 않는다.

## 연결

- [기능 검증](0188-analytics.md)
- [지표·통계 설계](../../specs/crelink-analytics.md)
- [배포 런북](../../../infra/docs/prod-runbook.md)
- [검증 루프](../../development/verification.md)

## 진행 기록

- 2026-11-06: 사용자 명시 배포 요청으로 착수했다. 직전 최종 pnpm verify 8단계·419개 검사와 고립 DB/실제 브라우저 검증을 재사용한다. 원격 main은 기존 기반 de773f6와 같아 추가 코드 병합은 없다. PR CI→main squash→Deploy를 우선하며 Actions 장애가 확인된 경우에만 문서화된 수동 경로를 사용한다.

- 2026-11-06 사전 확인: 릴리스 노트와 배포 티켓을 포함한 pnpm verify --keep-going 8단계·419개 검사가40.3초에 모두 통과했다. 신규 파일을 포함해 stage한 변경을 gitleaks stdin --redact로 검사해 탐지0건, work:scope0193·git diff --cached --check 통과. 별도 읽기 검토에서 migration/BlueGreen/라우팅의 배포 차단 결함은 없었다.

- 2026-11-06 Git/CI: f9a768c350f08b3ef04ead13956bae69d8403752를 원격 브랜치와 대조해 일치를 확인했다. [PR140](https://github.com/ai-worker-lab/crelink/pull/140)의 [CI42062966664](https://github.com/ai-worker-lab/crelink/actions/runs/42062966664)는 Node24/26·smoke·API/웹 컨테이너 빌드·work scope·필수 통과 job이 모두 성공했다. GitHub 연동 앱의 PR 쓰기403은 기존 gh 세션으로 처리했다. main squash 결과는472139bde5a8ebbe2a372b28aa86ae2cc0e8fe74(2026-11-05T16:22:00Z)이며 검사한 브랜치와 Git tree가 같다. 운영 Deploy42063680992가 같은SHA로 시작됐다.
