# 0030 업로드 이미지를 S3 호환 저장소로 이전

- 단계: 티켓
- 역할: orchestrator
- 선행: 0029
- 상태: 검증
- 종류: 운영
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-06

## 목적

업로드 이미지가 배포 대상 서버의 볼륨(`crelink-prod_uploads`)에 묶여 있어 서버 교체·대상 추가(OCI·AWS) 때 볼륨 복사와 쓰기 중단이 필요하고, 두 대상을 동시에 운영할 수 없습니다. `FileStorage` 경계 뒤 저장소를 S3 호환 API로 바꿔 서버와 독립시킵니다(운영 배포 설계의 이식 규칙 4).

## 수용 기준

- [x] API에 S3 호환 `FileStorage` 구현이 있고 설정(엔드포인트·버킷·자격 증명)으로 로컬 디스크와 고를 수 있다. DB에는 지금처럼 버킷 상대 키(`files.storage_key`, UUID)만 저장한다. 로컬 개발은 디스크 그대로 동작한다.
- [ ] 운영 저장소(SeaweedFS `s3.shaul.kr` 또는 Cloudflare R2)를 사용자가 고르고, 자격 증명은 대상별 SOPS 암호문(`infra/prod/secrets/<대상>.sops.env`)에만 둔다.
- [ ] 기존 볼륨의 파일을 새 저장소로 옮기는 1회 절차와 확인 방법, 되돌리기가 런북에 있고 운영에서 실행해 기록한다. 이후 `uploads` 볼륨을 compose에서 뺀다.
- [x] `pnpm verify`·`pnpm e2e`(업로드·조회) 통과, 설계·런북·API 문서·변경 기록 갱신.

## 범위

- 포함: `apps/api/src/files/`·설정, `infra/prod/`(compose·암호문 키), 런북·설계 문서.
- 제외: 공개 URL 직접 서빙·CDN(지금처럼 `GET /api/files/{id}`로 API가 제공), 이미지 변환.

## 위험·복구

운영 업로드 데이터 이전입니다. 이전 전 볼륨 백업(런북 "9-6. 볼륨 백업·복구"), 새 저장소 쓰기 확인 뒤 전환, 문제 시 디스크 저장소 설정으로 되돌립니다(런북 9-4). 같은 서버에 SeaweedFS를 두면 API는 표준화되지만 데이터는 여전히 그 서버에 묶이므로 선택 시 고려합니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md#이식-규칙)(이식 규칙 4, 위험·후속)
- 코드: `apps/api/src/files/file-storage.ts`(`FileStorage`, `LocalDiskFileStorage`), `apps/api/src/files/s3-file-storage.ts`(`S3FileStorage`), `apps/api/src/config.service.ts`(`parseFileStorageConfig`)
- API 문서: [apps/api/docs/README.md](../../../apps/api/docs/README.md#이미지-저장소)
- 런북: [infra/docs/prod-runbook.md](../../../infra/docs/prod-runbook.md#9-업로드-저장소)

## 진행 기록

- 2026-10-06: 생성(에픽 0024 호스팅 전환 때 후속으로 분리, AI 제안).
- 2026-10-06: SeaweedFS(`s3.shaul.kr`) 연동 사전 시험(사용자 요청, 코드 변경 없음).
  - 준비: 버킷 `crelink-uploads`(weed shell `s3.bucket.create`), 그 버킷만 쓰는 identity `crelink`(`Read`·`Write`·`List`·`Tagging:crelink-uploads`, 버킷 생성 권한 없음). 키는 home-server `/opt/seaweedfs/config/s3.json`에만 있고 이 티켓 구현 때 SOPS 암호문으로 옮깁니다.
  - 결과(크리링 운영 Docker 네트워크 `crelink-prod_default`의 컨테이너 → 공개 엔드포인트 `https://s3.shaul.kr`, AWS CLI): 4MB 객체 put 2.2~2.6초, get 3회 SHA-256 일치, Content-Type 유지. 다른 버킷 목록·버킷 생성은 `AccessDenied`, 익명 GET 403. 운영자 PC에서 presigned GET 200·SHA 일치.
  - **문제**: 키가 `.jpg`·`.webp`처럼 Cloudflare가 정적 파일로 보는 확장자면 서명된 `HEAD`가 간헐적으로 403(3회 중 1~2회), 확장자 없는 키는 항상 정상. Cloudflare Cache Rule(`s3.shaul.kr` Bypass cache) 미적용 상태라 생긴 일로 봅니다(home-seaweedfs README "Cloudflare 캐시 우회 규칙"). 구현 전 규칙을 적용하고, 키는 지금처럼 확장자 없는 UUID로 둡니다.
  - 시험 객체·도구 이미지는 지웠습니다.
- 2026-10-06: 사용자가 Cloudflare Cache Rule(`s3.shaul.kr` Bypass cache)을 적용한 뒤 재시험. 키 확장자 없음·`.jpg`·`.webp`·`.png`·`.bin`·`.zip` 각각 4MB 객체의 서명된 `HEAD`·`GET` 5회씩 모두 200·SHA 일치, `cf-cache-status: DYNAMIC`. 150MB 멀티파트 업로드 성공, 150MB `.bin` 다운로드 3회 SHA 일치. 위 간헐 403은 해소됐습니다. 시험 객체는 지웠습니다.
- 2026-10-07: 착수(브랜치 `work/0030-uploads-s3-storage`). 운영 저장소는 위 사전 시험의 SeaweedFS `https://s3.shaul.kr`, 버킷 `crelink-uploads`, identity `crelink`로 진행(통합 담당 지시). 운영 api 컨테이너에서 `s3.shaul.kr` HTTPS가 나가고 운영 uploads 볼륨은 파일 0개(통합 담당 확인).
- 2026-10-07: 결정.
  - 설정 이름 `FILE_STORAGE`(`disk` 기본·`s3`), `S3_ENDPOINT`·`S3_REGION`(기본 `us-east-1`)·`S3_BUCKET`·`S3_ACCESS_KEY_ID`·`S3_SECRET_ACCESS_KEY`. 운영 필수 검사는 저장소별(`disk`→`UPLOAD_DIR`, `s3`→`S3_*` 4개 + https 엔드포인트), 잘못된 값은 로컬에서도 기동 거부.
  - 같은 key 거부는 조건부 PUT `If-None-Match: *`. 로컬 `chrislusf/seaweedfs:4.47`(운영과 같은 버킷 범위 identity)에서 두 번째 PUT 412 `PreconditionFailed`, 동시 PUT 10개 중 1개만 성공을 확인해 대안(HeadObject 후 PUT, 경쟁 조건 있음)은 쓰지 않음. R2·AWS S3도 지원(공식 문서). 운영 경로(Cloudflare 경유)의 412는 전환 때 런북 9-3에서 확인.
  - 요청 한도: 연결 3초, 시도당 15초, 최대 3번(SDK standard). 재시도가 자기 첫 PUT에 412를 받는 경우 업로드 실패·고아 객체가 남는 한계를 문서화.
  - 기동 시 HeadBucket(5초)은 로그만 남기고 readiness에 넣지 않음: readiness가 이미지 HEALTHCHECK·`up --wait`·Caddy 기동 조건이라 저장소 장애가 단축 이동까지 막지 않게.
  - 계약 시험은 별도 compose 서비스 대신 테스트가 Docker로 일회용 SeaweedFS를 띄움(`apps/api/test/test-s3.ts`). CI `check` job도 같은 `pnpm verify`로 러너의 Docker를 쓰며, CI에서는 아직 실행하지 않음.
  - `.sops.yaml` `unencrypted_regex`에 비밀 아닌 `FILE_STORAGE`·`S3_ENDPOINT`·`S3_REGION`·`S3_BUCKET` 추가. 정규식이 파일 메타데이터에 기록돼 `sops edit`·`set`이 옛 정규식을 따르는 것을 sops 3.13.3 임시 키로 확인하고, 한 번 다시 암호화하는 명령을 런북 9-2에 둠. 암호문 갱신은 통합 담당.
  - `uploads` 볼륨은 이 커밋에서 유지(compose 주석·런북 9-5 정리 절차). 운영 볼륨이 비어 있어 바로 빼는 커밋을 별도로 둠: 그 커밋은 암호문에 `FILE_STORAGE=s3`가 같은 릴리스에 들어갈 때만 병합(볼륨 없이 `disk`면 이미지가 컨테이너 안에만 저장됨).
- 2026-10-07: 검증(로컬, macOS arm64, Docker 29.8.1).
  - `pnpm verify` 8단계 통과(API 11 suites 79 tests, 새 `test/file-storage.e2e-spec.ts`: disk·s3 계약 각 4개, 자격 증명·버킷 확인 2개, `FILE_STORAGE=s3` API 업로드·조회·객체 삭제 시 404 1개).
  - `make api-up web-up` 뒤 `pnpm e2e` 6 passed(disk). 같은 dev API를 `FILE_STORAGE=s3`(로컬 SeaweedFS 4.47 `127.0.0.1:18333`)로 다시 띄워 기동 로그 `파일 저장소 s3 확인: … 접근 가능`, `pnpm e2e` 6 passed, 버킷에 업로드 객체 2개(프로필·썸네일), 디스크 쓰기 없음. 확인 뒤 disk로 되돌림.
  - `docker buildx build --platform linux/amd64 -f apps/api/Dockerfile` 교차 빌드 통과(QEMU 없음). 이미지 392MB, `node_modules` 57MB, `*.node`·`binding.gyp`·install 스크립트 없음. 이 이미지를 `NODE_ENV=production`·`FILE_STORAGE=s3`·S3 키 일부로 실행하면 `비어 있음: S3_BUCKET, S3_SECRET_ACCESS_KEY / https URL이 아님: S3_ENDPOINT`로 종료 1.
  - 런북 9-3·9-4의 aws-cli 명령(sync·`--dryrun`·`ls --summarize`·조건부 `put-object` 두 번째 412·역방향 sync)을 로컬 SeaweedFS 4.47과 `amazon/aws-cli` 2.37.9로 리허설. `.sops.yaml` 정규식 재암호화와 `sops set --value-stdin`은 sops 3.13.3 임시 age 키로 확인.
  - 남은 일(통합 담당): 암호문에 키 추가(런북 9-2, 값 출처 서버 `/opt/seaweedfs/config/s3.json`의 identity `crelink`), 배포와 운영 확인(런북 9-3, Cloudflare 경유 412 포함), `uploads` 볼륨 제거(런북 9-5) 후 수용 기준 2·3 확인.
