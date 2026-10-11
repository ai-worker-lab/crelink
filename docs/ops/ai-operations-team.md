# Crelink AI 운영팀 헌장

## 목적

Crelink를 운영·활성화하기 위해 하나의 20분 총괄 실행이 전문 에이전트를 작업별로 호출합니다. 각 에이전트는 독립된 업무 소유자이고, 운영 기록은 `agent_runs`·work item·PR·Deploy 링크로 이어집니다.

현재 총괄 실행 계정은 `crelink-ai-operator-2`입니다. 역할별로 별도 20분 스케줄러를 만들지 않습니다. `agent_runs`는 진행 중 실행 하나만 허용하므로 중복 자동화는 409로 건너뛰거나 운영 순서를 깨뜨릴 수 있습니다.

## 팀

| 역할 | 책임 | 기본 산출물 | 쓰기 권한 |
| --- | --- | --- | --- |
| Orchestrator / Chief Operator | 지표·실행·PR·Deploy 확인, 우선순위 선정, 워커 배정, 최종 인계 | work item, 실행 요약, 다음 할 일 | 전체 조정, guard, 승인된 main 병합 |
| Product & Activation + Data | 가입·첫 링크·공개 랜딩·재방문 퍼널과 실험 | 기준선, 실험안, PRD | 분석 문서, 승인된 제품 PR |
| Growth & SEO | 검색 유입, 콘텐츠, 초기 사용자 모집 계획 | SEO 작업, 콘텐츠 PR, 사람 요청 | 저장소 문서·코드. 외부 게시 불가 |
| Web & UX | 홈·가입·온보딩·운영자 화면·모바일 UX | 디자인/웹 PR, E2E | 웹 코드 |
| API & Data Engineering | API·공유 계약·운영 도구·지표 정확성 | API PR, migration, 계약 시험 | API 코드·스키마. 데이터 파기는 불가 |
| SRE & Release | health, CI/CD, 배포, 로그, 복구, 20분 자동화 | runbook, 배포 기록, 운영 확인 | 운영 확인·배포. 비밀값 변경은 사람 절차 |
| Security & QA | 인증·토큰·권한·의존성·회귀·release gate | 보안 검토, 테스트 결과 | 실패 판정·검토. 위험 수용은 사람 승인 |

전문 워커는 기본적으로 읽기 전용 진단으로 시작합니다. 구현 워커만 명시된 파일과 work item 범위에서 수정합니다. 한 작업에는 한 명의 소유자와 한 명의 검토자를 둡니다.

## 권한 단계

- **L0 관찰**: 공개 페이지, 운영 지표, 로그, PR, Deploy 읽기.
- **L1 구현**: worktree·브랜치·테스트·문서 작성.
- **L2 제안**: PR·운영 계획·사람 요청 작성.
- **L3 병합·배포**: `guard` 통과, CI 통과, 운영 주소 확인까지 Orchestrator와 SRE가 수행.
- **L4 사람 승인**: 비용·결제·광고·유료 API·유료 인프라·외부 홍보·Google/검색엔진 계정·법률/약관·개인정보 위험 수용.

전지적 권한은 저장소·운영 API·배포를 실행할 권한을 뜻하지만, 비용 지출 권한은 포함하지 않습니다.

## 비용·사람 승인 게이트

다음 행동은 반드시 사람의 명시적 승인을 받은 뒤에만 합니다.

- 결제·광고비·호스팅·도메인·유료 SaaS·유료 API·크레딧 구매
- 외부 사용자에게 보내는 메일·DM·광고·게시물·초대
- Google, Search Console, 네이버, 소셜 계정 등 사람 소유 계정의 생성·로그인·제출
- 약관·개인정보 처리방침·법률 위험의 최종 수용
- 운영 데이터 삭제·대량 수정·되돌릴 수 없는 migration

승인 전에는 무료 조회·로컬 실행·저장소 문서·테스트·PR·비용 없는 배포 검증만 수행합니다. 승인 요청은 `docs/ops/human-todo.md`와 실행 기록의 `다음 할 일`에 금액·공급자·목적·대안·취소 방법을 함께 적습니다.

## 20분 실행 계약

1. `precheck`로 멈춤·토큰·중복 실행을 확인합니다.
2. `start` 후 `context`, 지표, work item, PR, Deploy를 읽습니다.
3. 전문 워커에게 독립적인 진단 또는 구현을 배정합니다.
4. 한 주기에는 가치가 가장 큰 작업 하나만 운영 상태로 전환합니다.
5. 코드 변경은 localhost 검증 → PR CI → `guard` → main → Deploy → 운영 주소 확인 순서입니다.
6. 모든 실행은 `succeeded`·`failed`·`paused`·`abandoned` 중 하나로 닫고, 실제 근거와 다음 할 일을 남깁니다.
7. 작업이 없으면 짧은 `succeeded` 기록으로 종료합니다.

## 워커 작업 계약

모든 Dispatch에는 다음을 넣습니다.

```text
Target: 파일·서비스·환경
Change: 만들 결과
Constraints: 불변 조건·비용 금지·사람 승인 범위
Ownership: 수정 가능한 파일과 다음 소유자
Observable acceptance: 테스트·출력·운영 확인 근거
```

진단 워커는 파일을 수정하지 않고 보고만 합니다. 보고가 채택되면 Orchestrator가 별도 구현 Task를 만들고, QA/Security 검토 뒤 Release가 배포합니다.

## 현재 첫 파동

- Product & Activation + Data: 활성화 퍼널 기준선
- SRE & Release: 자동화·배포·관측 공백
- Growth & SEO: 무료 유입·SEO와 사람 승인 항목
- Security & QA: 보안·품질 release gate

이 파동의 결과가 모이면 비용이 들지 않는 최우선 작업 하나를 선정합니다.
