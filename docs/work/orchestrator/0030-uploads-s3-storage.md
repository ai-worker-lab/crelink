# 0030 업로드 이미지를 S3 호환 저장소로 이전

- 단계: 티켓
- 역할: orchestrator
- 선행: 0029
- 상태: 분류 대기
- 종류: 운영
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-06

## 목적

업로드 이미지가 배포 대상 서버의 볼륨(`crelink-prod_uploads`)에 묶여 있어 서버 교체·대상 추가(OCI·AWS) 때 볼륨 복사와 쓰기 중단이 필요하고, 두 대상을 동시에 운영할 수 없습니다. `FileStorage` 경계 뒤 저장소를 S3 호환 API로 바꿔 서버와 독립시킵니다(운영 배포 설계의 이식 규칙 4).

## 수용 기준

- [ ] API에 S3 호환 `FileStorage` 구현이 있고 설정(엔드포인트·버킷·자격 증명)으로 로컬 디스크와 고를 수 있다. DB에는 지금처럼 버킷 상대 키(`files.storage_key`, UUID)만 저장한다. 로컬 개발은 디스크 그대로 동작한다.
- [ ] 운영 저장소(SeaweedFS `s3.shaul.kr` 또는 Cloudflare R2)를 사용자가 고르고, 자격 증명은 대상별 SOPS 암호문(`infra/prod/secrets/<대상>.sops.env`)에만 둔다.
- [ ] 기존 볼륨의 파일을 새 저장소로 옮기는 1회 절차와 확인 방법, 되돌리기가 런북에 있고 운영에서 실행해 기록한다. 이후 `uploads` 볼륨을 compose에서 뺀다.
- [ ] `pnpm verify`·`pnpm e2e`(업로드·조회) 통과, 설계·런북·API 문서·변경 기록 갱신.

## 범위

- 포함: `apps/api/src/files/`·설정, `infra/prod/`(compose·암호문 키), 런북·설계 문서.
- 제외: 공개 URL 직접 서빙·CDN(지금처럼 `GET /api/files/{id}`로 API가 제공), 이미지 변환.

## 위험·복구

운영 업로드 데이터 이전입니다. 이전 전 볼륨 백업(런북 "업로드 볼륨 백업·복구"), 새 저장소 쓰기 확인 뒤 전환, 문제 시 디스크 저장소 설정으로 되돌립니다. 같은 서버에 SeaweedFS를 두면 API는 표준화되지만 데이터는 여전히 그 서버에 묶이므로 선택 시 고려합니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md#이식-규칙)
- 코드: `apps/api/src/files/file-storage.ts`(`FileStorage`, `LocalDiskFileStorage`)
- 런북: [infra/docs/prod-runbook.md](../../../infra/docs/prod-runbook.md#9-업로드-볼륨-백업복구)

## 진행 기록

- 2026-10-06: 생성(에픽 0024 호스팅 전환 때 후속으로 분리, AI 제안).
- 2026-10-06: SeaweedFS(`s3.shaul.kr`) 연동 사전 시험(사용자 요청, 코드 변경 없음).
  - 준비: 버킷 `crelink-uploads`(weed shell `s3.bucket.create`), 그 버킷만 쓰는 identity `crelink`(`Read`·`Write`·`List`·`Tagging:crelink-uploads`, 버킷 생성 권한 없음). 키는 home-server `/opt/seaweedfs/config/s3.json`에만 있고 이 티켓 구현 때 SOPS 암호문으로 옮깁니다.
  - 결과(크리링 운영 Docker 네트워크 `crelink-prod_default`의 컨테이너 → 공개 엔드포인트 `https://s3.shaul.kr`, AWS CLI): 4MB 객체 put 2.2~2.6초, get 3회 SHA-256 일치, Content-Type 유지. 다른 버킷 목록·버킷 생성은 `AccessDenied`, 익명 GET 403. 운영자 PC에서 presigned GET 200·SHA 일치.
  - **문제**: 키가 `.jpg`·`.webp`처럼 Cloudflare가 정적 파일로 보는 확장자면 서명된 `HEAD`가 간헐적으로 403(3회 중 1~2회), 확장자 없는 키는 항상 정상. Cloudflare Cache Rule(`s3.shaul.kr` Bypass cache) 미적용 상태라 생긴 일로 봅니다(home-seaweedfs README "Cloudflare 캐시 우회 규칙"). 구현 전 규칙을 적용하고, 키는 지금처럼 확장자 없는 UUID로 둡니다.
  - 시험 객체·도구 이미지는 지웠습니다.
