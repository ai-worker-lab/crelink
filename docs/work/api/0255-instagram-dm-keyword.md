# 0255 키워드 매칭 순수 함수

- 단계: 티켓
- 역할: api
- 상위: 0251
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

키워드 매칭 순수 함수

위험 등급 R2, 담당 Sol medium.

## 수용 기준

- [ ] `... test -- keyword` 통과. NFC·공백·대소문자·포함·빈 입력

## 범위

- 포함: `apps/api/src/instagram/keyword{,.spec}.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: Codex Sol medium 구현, Claude가 재검증(`jest --runTestsByPath src/instagram/keyword.spec.ts` 13건 통과). 일치 방식은 포함.
