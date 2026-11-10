# 0260 규칙 API·게시물 목록

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

규칙 API·게시물 목록

위험 등급 R2, 담당 Sol medium.

## 수용 기준

- [ ] `... test -- instagram-rules` 통과. 한도, 250자, 게시물 중복 409, 소유자 전용, `/s/` 코드 연결, 캐러셀 처리(S5 결과), 문구 제약 없음; 규칙 수정·비활성화·보관이 `version`을 올리고 `pending`을 취소, 다른 크리에이터의 `publicId`는 404(조회·변경 모두 SQL에 소유자 조건)

## 범위

- 포함: `instagram/rules*.ts`, `creator/creator.module.ts`(export 1줄), `test/instagram-rules.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
