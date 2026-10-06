# 0024 운영(prod) 배포와 GitHub Actions CD

- 단계: 에픽
- 상태: 진행
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

크리링 MVP를 운영 환경(Vercel 웹 + OCI API + Supabase DB, 임시 도메인 `links.shaul.kr`)에 배포하고, main 병합 시 자동 배포·자동/수동 롤백이 되는 GitHub Actions CD를 갖춥니다. 이후 운영하며 자동화를 고도화하는 기반입니다.

## 수용 기준

- [ ] 저장소 쪽 구현(API 이미지·프록시 IP·DB TLS, 웹 내부 토큰·Vercel 설정, `infra/prod/`, CD 워크플로)이 로컬에서 검증된다(0025~0028).
- [ ] 사용자 준비물(OCI·Supabase·Vercel·DNS·Google·GitHub secrets)을 넣은 뒤 최초 배포가 성공하고 운영 주소에서 로그인·단축 URL·랜딩이 동작한다(0029).
- [ ] main 병합이 CI 통과 뒤 자동 배포되고, 배포 후 헬스체크 실패 시 자동 롤백, 수동 롤백 워크플로가 동작한다(0029에서 실행 확인).

## 범위

- 포함: 설계 문서의 변경 범위 표.
- 제외: dev(스테이징) 환경, 속도 제한·WAF, 이미지 저장소 Supabase Storage 이전, 모니터링·알림 고도화(후속).

## 위험·복구

운영 데이터·외부 계정이 걸립니다. 자원 생성·DNS 변경·시크릿 등록은 사용자가 실행하거나 승인합니다. 자세한 위험은 설계 문서 `위험·미정`.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성. 사용자 선택: 템플릿 계획대로 분리(Vercel·OCI·Supabase), 도메인 `shaul.kr`(임시 `links.shaul.kr`), main 병합 시 자동 배포 + 수동 롤백.
