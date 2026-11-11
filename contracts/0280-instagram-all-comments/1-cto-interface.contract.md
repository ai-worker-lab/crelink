# 0280 모든 댓글 DM·최초 1회 — CTO 인터페이스 계약
## 계약 메타데이터
- 작업 ID 0280 / task-a23249ec642343519524c546759d8d20 / scope instagram-comment-dm / 작성 CTO / 저장 Coordinator / 2026-11-11 KST
- 문서 구분: 작업 이력(진행 중)
- 입력 기준: docs/specs/instagram-comment-dm.md 읽은 r3-token-identity-2026-11-11·uN 미기록·sha256 d171ccf7a7c6 / crelink work/0280-instagram-all-comments @ac4a586
- 대상: R30-2·R30-3·R30-4·R30-6(인증 항목은 r3 유지) / 이전: contracts/0277(수정 금지)
- 제안: 사용자 hotfix. 범위는 [잠정] 같은 사람·같은 게시물 1회. 사용자 답을 기다리는 중이며 Coordinator가 확정 전달

## 근거
현재 중복 방지는 partial UNIQUE(rule_id,commenter_hash)라 failed·expired·cancelled는 제외됨(migrations/0016:86-87). 90일 보존 작업이 삭제(retention.service.ts:170-171). 연결 해제 시 CASCADE, 보관 뒤 재생성하면 rule_id가 새로 생겨 다시 보낼 수 있음. 활성 규칙은 게시물당 1개(0016:57-58)

## 데이터(migration 0019, 추가만·비파괴)
- rules ADD match_all_comments boolean NOT NULL DEFAULT false(기존 행 false)
- keyword CHECK 교체: char_length<=30 AND (match_all_comments OR char_length>=1)
- CREATE TABLE instagram_dm_recipients(ig_user_id text, scope_key text, commenter_hash bytea(32, HMAC·원문 없음), created_at timestamptz, PK(ig_user_id,scope_key,commenter_hash))
  - scope_key = 규칙 ig_media_id(캐러셀 자식 아님) / 계정 전체로 확정되면 '*'
  - FK 없음, 90일 파기 제외
- 백필: 기존 deliveries 중 pending·sending·sent·unknown → ON CONFLICT DO NOTHING
- health 시험 목록에 0019 추가

## API·shared
- RuleView·Create·Update에 matchAllComments 추가. 생성 시 기본 false
- 검증: false면 keyword 1~30, true면 0~30(입력값 보존)
- 생성 시 campaign의 keyword가 비면 'all'
- 값이 바뀌면 version+1, pending 취소(기존 편집 경로와 같음)
- DeliveryView에 matchAllComments 추가

## 웹훅
- findRule: match_all이면 미디어만 일치하면 됨
- INSERT_DELIVERIES를 CTE로 변경: 기존 조건 전부(version·자격·24h·opt-out) 적용 → DISTINCT ON(키) 가장 이른 댓글 → recipients INSERT ON CONFLICT DO NOTHING RETURNING → 받은 행만 deliveries 저장
- 잠금 순서: rules → recipients → deliveries(lock-order.ts 주석 갱신)
- worker·private reply 1회 구조는 변경 없음

## 중복 보장
- 재전송·같은 배치·동시 웹훅: PK로 1회
- 편집·토글: 마커 유지, version이 다르면 마커를 쓰지 않음
- 보관 뒤 재생성·해제·재연결·90일 파기: 마커 유지
- Meta 삭제 콜백: 같은 트랜잭션에서 ig_user_id 마커 DELETE
- 수신 거부·정지·한도·owner·토큰: 기존 그대로
- 첫 댓글 1회 소비(취소·실패해도 재시도 없음)

## 웹
- 체크박스 기본 꺼짐. 켜면 keyword 입력은 disabled지만 값 유지. 끄면 값이 돌아오고 다시 검증
- 목록·내역에 '모든 댓글' 표시
- 390px·1280px 넘침 없음, 콘솔 0

## 시험
- T1 기존 키워드 동작 불변
- T2 모든 댓글 모드 저장
- T3 같은 사람 반복 1건
- T4 다른 사람 각 1건
- T5 다른 게시물 각 1건(잠정 범위)
- T6 동시 웹훅 1건
- T7 보관 후 재생성 0건
- T8 편집 경합: 옛 version 0건, 마커 미소비
- T9 90일 파기 뒤 0건, 삭제 콜백 뒤 마커 삭제
- T10 재연결 0건
- T11 API 검증·응답 필드
- T12 web state 시험

## 하지 말 것
DROP·데이터 삭제 migration, 원문·사용자명 저장, 새 env·키, infra·인증 변경, 별도 QA 호출
## 롤백
PR revert. 표·열은 남겨 둠. 옛 코드는 match_all을 무시(키워드가 비면 매칭 0)

## Coordinator 확정 인계 R2 — 사용자 답변 반영

- 요구 결정권자: 사용자. 사용자가 같은 사람·같은 게시물에서 한 번만 발송을 명시 선택했다. 위 R1의 잠정·답변 대기는 당시 이력이며 현재 범위는 확정이다. scope_key는 정규 게시물 ig_media_id만 쓰고 계정전체 별표 모드나 옵션을 구현하지 않는다.
- 현재 요구 리비전 r4-all-comments-2026-11-11/u1, 인증 항목은 r3-token-identity-2026-11-11 유지. Coordinator가 저장하고 DEV가 SSoT 해당 범위·문구를 동기화한다. 과거 계약은 수정하지 않는다.
- 처리방침의 저장 항목·기간·해제 설명 정정은 사용자 요청을 실현하는 필수 문구 변경으로 함께 진행한다. 별도 개인정보 동의나 제품 승인 단계를 추정해 추가하지 않는다.
- 최초의 유효한 댓글에서 발송 기회를 소비하며, 후속 댓글이 새 delivery를 만들지 않는다. worker의 기존 안전한 네트워크 재시도·응답 불명 처리·정지/수신거부/한도는 바꾸지 않는다. 사용자 입력 원문·계정명·토큰 저장이나 신규 키는 금지한다.
- 검증 담당: DEV는 관련 shared/web unit·API4종 및 health migration 목록·typecheck/scope를 확인한다. Coordinator가 실제 로컬 checkbox 생성/편집/저장/복귀, 390·1280 폭/콘솔, ci:local 및 report를 실행한다. private 로그 /tmp/crelink-0280-ci.log·/tmp/crelink-0280-ci-report.log·/tmp/crelink-0280-ui에 최종 HEAD를 연결한다. review 양측은 코드 및 실제 증거만 판정하며 배포 미래 결과를 요구하지 않는다. 최종 코드에 양측 각1회·complete 후 PR/머지/Deploy. 별도 QA·디자인·전체인프라회귀·Meta 리서치 제외.
