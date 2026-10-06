# 0029 최초 prod 프로비저닝과 실서비스 검증

- 단계: 티켓
- 역할: orchestrator
- 상위: 0024
- 선행: 0028
- 상태: 분류 대기
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

사용자가 준비한 계정·시크릿으로 최초 배포를 실행하고 운영 주소에서 end-to-end로 동작함을 확인합니다.

## 수용 기준

- [ ] 사용자 준비물 완료: OCI 서버(공인 IP·SSH 키), Supabase 프로젝트(세션 풀러 URL·CA), Vercel 프로젝트·토큰, DNS(`links`·`go`), Google OAuth 운영 리디렉션 URI, GitHub secrets.
- [ ] 서버 부트스트랩·최초 `deploy.sh`·Vercel 최초 배포가 성공하고 `https://links.shaul.kr`에서 구글 로그인, 링크 관리, 랜딩, 단축 URL 클릭 기록(IP가 클라이언트 IP)이 동작한다.
- [ ] `deploy.yml` 자동 배포 1회, 의도적 실패(헬스 실패) 자동 롤백 1회, `rollback.yml` 수동 롤백 1회를 실제로 실행해 결과를 기록한다.

## 범위

- 포함: 운영 실행·검증 기록.
- 제외: 새 기능.

## 위험·복구

운영 데이터·DNS·계정 작업입니다. 파괴적 명령 없이 단계별로 사용자 확인을 받습니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
