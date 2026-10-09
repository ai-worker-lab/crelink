# 0070 크리에이터 배너 API

- 단계: 티켓
- 역할: api
- 상위: 0063
- 선행: 0068, 0069
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T4입니다. 요구는 R21 ②④⑤⑥, R14입니다.

## 수용 기준

- [x] 크리에이터 배너 쓰기(새 `creator/banners.service.ts`·controller): `/api/me/banners…` 4경로, 잠금 순서, 한도(보이는·보관)와 숨김 해제 409, 차단 유지, 차단 도메인 거부, 미부여 403, 정지 이미지 규칙. 통합 테스트(한도 경계 n-1·n·보관 상한, 회수와 쓰기 동시).

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T4
- 요구: [PRD](../../product/crelink.md#요구사항) R21 ②④⑤⑥, R14
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간). 공유 계약(`packages/shared`)은 바꾸지 않았습니다.
  - `src/creator/banners.service.ts` `BannersService`·`src/creator/banners.controller.ts` `BannersController`(`@Controller('me/banners')`, `SessionGuard`): `POST /api/me/banners`(201, 맨 뒤 `coalesce(max(position) + 1, 0)`, 공개 ID `insertWithRandomId(10)`), `PATCH`·`DELETE /api/me/banners/{id}`(204), `PUT /api/me/banners/order`(이 랜딩 전체 id, `orderedIds` → 400 `order_mismatch`, 응답 `CreatorService.creatorBanners`). `CreatorModule`에 등록.
  - 잠금 순서: 한 트랜잭션에서 `SELECT banner_slot_granted_at … FROM users … FOR UPDATE` → 부여 아니면 403 `banner_slot_not_granted`(없는 배너도 403) → 배너 소유(`user_id`, `FOR UPDATE`, 404 `banner_not_found`)·파일 소유(`FilesService.ownedFileId`, 404 `file_not_found`) → 정지 이미지 규칙 → 차단 도메인 → 한도.
  - 한도(`CreatorService.bannerLimits`, 랜딩마다): 추가는 보관 상한(409 `banner_total_limit_reached`)을 먼저, 숨기지 않은 추가와 숨김 해제(차단 아닌 배너)만 n(409 `banner_limit_reached`). 문구는 설계 패널 문구에 n·m을 넣은 것.
  - 차단: `blocked_at`·`blocked_reason`은 건드리지 않음(주소를 바꿔도 유지). 새 URL은 `CreatorService.blockedDomainFor`로 422 `link_domain_blocked`. URL 형식은 링크와 같은 `linkUrl`(`links.service.ts`에서 내보냄, 400 `link_url_invalid`), null·빈 문자열은 연결 없음(url·host NULL).
  - 정지 이미지: 최종 (이미지, 정지 이미지) 짝을 `FilesService.isAnimated`로 검사. 움직이면 정지 이미지 필수이고 그 파일은 움직이지 않아야 함, 움직이지 않으면 정지 이미지를 둘 수 없음. PATCH에서 `imageFileId`를 바꾸면 `stillImageFileId`도 같은 요청에 있어야 함. 짝 필드가 없는 PATCH는 다시 검사하지 않음. 어기면 400 `validation_failed`. 이미지 없음·null도 400 `validation_failed`.
  - 문서: `apps/api/docs/README.md` 크리에이터 규칙 `크리에이터 배너 쓰기`, `apps/api/CHANGELOGS.md`.
  - 설계와 다른 점: 없음. 설계가 정하지 않은 세부 두 가지를 정했습니다. (1) 움직이지 않는 이미지에 `stillImageFileId`를 보내면 저장하지 않고 400(계약 "아니면 null"을 엄격히 읽음). (2) 403 `message`는 미부여·회수 공통 문구(`배너 슬롯이 부여되지 않아…`)이고, 회수 안내 문구는 설계대로 웹이 코드로 정합니다.
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`, 격리 인스턴스 `PORT_SLOT=44`·Compose project `crelink-t4`).
  - `make infra-up` 뒤 `pnpm --filter @crelink/api test -- creator-banners` 12/12 통과(`BANNER_SLOT_MAX=3`·`BANNER_SLOT_TOTAL_MAX=5`): 추가 응답·순서·연결 없음, 입력 검사(이미지·대체 문구·숨김 형식 400, 주소 400, 남의·없는 파일 404, 차단 도메인·하위 도메인 422), 정지 이미지 규칙(POST 4가지 거부, NULL 지연 판정, PATCH 4가지 거부·정지 이미지만 교체·정지로 교체), 한도 경계(n-1 → n 201, n에서 409, 숨김은 보관 상한까지, 상한에서 숨김·보임 모두 `banner_total_limit_reached`), 숨김 해제 409·숨긴 뒤 받음·차단 배너는 한도 밖, 설정값을 낮추면 추가·숨김 해제만 막음, 차단 유지(주소 변경·연결 없음)·차단 도메인 422·숨김 전환·삭제, 남의·없는·형식 틀린 id 404, 순서(mismatch 5가지·숨김·차단 포함 재정렬·새 배너 맨 뒤), 미부여 4경로 403(보관 배너 유지)·로그인 없음 401, 동시: 회수 트랜잭션이 사용자 행을 잡은 동안 POST·PATCH·DELETE가 기다렸다가 회수 뒤 403(행 변화 없음), n-1에서 추가 3건 동시 → 201 1건·409 2건, 추가와 회수 동시 → 회수 뒤 요청 403·개수 일치.
  - `make api-up` 뒤 실제 HTTP(`127.0.0.1:7420`, 사용자·랜딩·세션·차단 도메인은 SQL로 넣음, 이미지는 실제 `POST /api/me/files`): 움직이는 PNG만 400 `validation_failed`, 정지 이미지와 함께 201, `www.evil.example` 422, `ftp://` 400, 미부여 403, 세션 없음 401, 보이는 5장에서 6장째 409 `banner_limit_reached`, 숨김 추가 201·숨김 해제 409, 차단 배너 주소 변경 200(`blocked: true`·사유 유지), 차단 도메인으로 변경 422, 이미지만 변경 400, 없는 id 404, 순서 200(position 0..5)·일부 id 400 `order_mismatch`, 삭제 204·다시 404, 회수(SQL) 뒤 PATCH·DELETE·순서 403(배너 5장 보관).
  - `make web-up` 뒤 `pnpm smoke` 5/5 통과.
- 2026-10-09: 0085 통합에서 실제 웹 화면으로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts` `배너 슬롯`).
  - 쓰기: 추가(차단 도메인 422), 보이는 5장에서 추가 막힘, 숨긴 배너 다시 보이기 409, 정렬, 삭제.
  - 차단: 배너 차단 뒤 주소를 바꿔도 차단이 유지됩니다.
  - 회수: 폼을 연 채 회수되면 저장이 403이고 회수 흐름을 탑니다. 회수 뒤에도 배너는 보관됩니다.
