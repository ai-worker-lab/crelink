# 0261 발송 내역 API·가용 여부

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0253, 0254
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

발송 내역 API·가용 여부

위험 등급 R2, 담당 Sol medium.

## 수용 기준

- [ ] `... test -- instagram-deliveries` 통과. 커서, 응답 키에 해시·comment_id 없음; 다른 크리에이터의 `rule` 필터와 내역은 404(SQL에 소유자 조건)

## 범위

- 포함: `instagram/deliveries*.ts`, `creator/creator.controller.ts`, `test/instagram-deliveries.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
