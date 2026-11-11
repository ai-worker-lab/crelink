# [Infra Deployment Contract] Instagram DM 운영 설정

- 계약 ID: 0274-infra-r1
- 현재 기준: [Instagram 설계](../../docs/specs/instagram-comment-dm.md), 실행 원본 `apps/api/src/config.service.ts`와 `infra/prod/compose.yaml`.
- 변경 권한·사유: 사용자가 Meta 연동 방법을 요청하고 SOPS 설정 등록 완료를 보고함. 기존 인가된 PR 배포 경로로 운영 메뉴를 활성화한다.
- 작업 이력: [0274](../../docs/work/orchestrator/0274-instagram-dm-prod-settings.md). 비밀값은 계약·로그에 기록하지 않는다.

## 1. 인프라 변경 및 영향 범위

사용자 등록 SOPS 암호문에 Instagram 필수 8개 키를 추가한다. 대상은 API이며 서버가 복호화해 기존 env_file로 주입한다. 설정 존재로 Instagram worker·API가 활성화된다. 공개 범위는 별도 DB 설정이며 이 변경으로 수정하지 않는다. 기존 규칙이나 대기 발송이 있으면 자동 처리될 수 있어 배포 전 건수만 조회한다. 포트·네트워크·데이터 경로는 변경하지 않는다.

## 2. 무중단 배포 및 롤백 계획

기존 Deploy의 Blue/Green 전환. 새 색 readiness 통과 전 기존 색 유지. 실패하면 기존 릴리스로 롤백하며 DB는 되돌리지 않는다. 마이그레이션 변경 없음. 새로운 연결·발송 시험은 이번 범위 밖이다.

## 3. 리소스 및 커넥션 풀 영향

DB 풀·CPU·메모리 상한 변경 없음. 기존 API 프로세스에서 Instagram worker가 시작한다.

## 4. 헬스체크 및 관측 가능성 검증

API 파서의 필수 키·32바이트 base64·키 분리 검증과 SOPS 암호화 확인을 메인 세션에서 수행한다. 검수 에이전트는 복호화·키체인·Meta 호출을 금지한다. 로컬 CI·prod 구성/스크립트/회귀 검사를 수행하고 Deploy job, 설정 존재 여부 및 운영 메뉴를 읽기 전용으로 확인한다. 값은 출력하지 않는다. 실제 결과는 0274 진행 기록에 남긴다.
