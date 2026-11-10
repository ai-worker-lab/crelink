# 0265 발송 내역 화면

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

발송 내역 화면

위험 등급 R2, 담당 Sol medium.

## 수용 기준

- [ ] 위와 같음, 빈·오류·더 보기

## 범위

- 포함: `.../instagram/deliveries/page.tsx`, `components/manage/instagram-deliveries/**`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
