# 0262 공개 경로(2개만)

- 단계: 티켓
- 역할: infra
- 상위: 0251
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

공개 경로(2개만)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [x] `bash infra/prod/tests/caddy-routing.sh` 통과. 새 경로 2개의 GET·POST만 API로, 그 밖은 기존과 같음

## 범위

- 포함: `infra/prod/Caddyfile`, `infra/prod/tests/caddy-routing.sh`, `infra/prod/verify.sh`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: `bash infra/prod/tests/caddy-routing.sh`를 Docker(`caddy:2.11.7-alpine`)로 실행해 통과 172, 실패 0(시작 전 94건, 웹훅 관련 78건 추가). 새 경로 2개의 GET·POST, 다른 메서드·하위 경로·변형 경로의 web 유지, 단축 호스트 404, 6,000,000바이트 전달과 해시·서명 헤더 보존, 6,000,001바이트 413, 색 전환 뒤 유지를 봅니다.
- 2026-11-11: 시험이 실제로 잡는지 저장소 밖 사본의 Caddyfile을 바꿔 확인했습니다. `path` matcher 실패 26건, `path_regexp` 실패 22건, `path` 와일드카드 실패 40건, `method` 삭제 실패 11건, `max_size 7MB` 실패 1건, 웹훅을 web 업스트림으로 돌림 실패 7건입니다. `path_regexp` 외 다섯 변이는 의미 없는 변형 경로 시험 2건을 지우기 전 174건 판에서 돌렸습니다.
- 2026-11-11: `bash -n` 통과, `shellcheck -x`는 `koalaman/shellcheck:stable` 이미지로 실행해 통과, `config --quiet`(blue·green·edge) 통과. `tests/deploy-rollback.sh` 통과 97·실패 0, `tests/cutover-rehearsal.sh` 통과 57·실패 0, `tests/zero-downtime.sh` 통과 26·실패 0.
- 2026-11-11: `verify.sh`는 서버에서 Cloudflare를 거쳐 도는 검사라 실제로 실행하지 못했습니다. 저장소 밖 사본에서 `curl`을 심으로 바꿔 파일 전체를 돌려 판정만 확인했습니다. JSON·`text/plain`의 403·404·503은 통과(검사 14개), HTML 404·200, `text/plain` 200, 502, 응답 없음은 실패입니다. 실제 Next·API 응답의 `content-type`은 로컬이나 운영에서 재지 않았고, 병합 뒤 Deploy job의 운영 주소 검사(14개)로만 확인합니다. 이 검사가 실패하면 CD가 직전 릴리스로 롤백합니다.
- 2026-11-11: `pnpm work:scope 0262`는 실패(종료 1)합니다. 머지 베이스 4eb9919 기준으로 이 브랜치의 조상 커밋 2736f47(0251 설계 문서, main에 아직 없음)이 바꾼 `docs/product/crelink.md`, `docs/specs/README.md`, `docs/specs/instagram-comment-dm.md` 3개를 소유 경로 밖으로 잡습니다. 이 티켓의 커밋은 그 파일을 바꾸지 않았고, `pnpm work:scope 0262 --base 2736f47`은 변경 파일 5개 모두 소유 경로 안으로 통과합니다. 2736f47이 main에 들어간 뒤 옵션 없는 명령을 다시 확인해야 합니다.
- 2026-11-11: 실제 Meta 웹훅 수신은 검증하지 않았습니다(설계 A3a, API 쪽은 0257).
- 2026-11-11: 소유 경로 밖이라 고치지 않은 문서: `infra/prod/README.md`와 `infra/docs/prod-runbook.md`의 검사 개수(13개)·웹 호스트 공개 정책, `docs/specs/crelink-prod-deploy.md` `공개 경로와 Caddy 정책`. 후속 처리가 필요합니다.
