# 0126 서버 렌더 날짜·시각 표기가 브라우저와 다름(오전/오후·PM)

- 단계: 티켓
- 역할: web
- 상태: 분류 대기
- 종류: 결함
- 우선순위: P3 (AI 제안)
- 작성일: 2026-10-10

## 목적

로컬 Node 22.23(ICU 78)에서 `Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })`가 `2026. 11. 30. PM 11:59`를 돌려주고, Chromium은 `오후 11:59`를 돌려줍니다. 서버 렌더 화면(홈·운영자 화면)의 `formatDateTime` 결과가 브라우저와 다르게 보일 수 있고, 같은 값을 서버·클라이언트가 함께 그리면 하이드레이션 불일치가 날 수 있습니다. 0092 디자인 작업(`design/slot-event/handoff.md` 기술 검토 요청 참고)에서 발견했습니다.

## 수용 기준

- [ ] 운영 Node 버전에서 `formatDate`·`formatDateTime`(`apps/web/src/lib/format.ts`)의 서버 결과가 브라우저와 같은 표기(`오전`·`오후`)인지 확인하고, 다르면 고정 형식으로 바꿉니다. 확인: 단위 테스트.

## 범위

- 포함: `apps/web/src/lib/format.ts`의 날짜·시각 형식.
- 제외: 그 밖의 화면 변경.

## 위험·복구

해당 없음(표기만).

## 연결

- 발견: `design/slot-event/handoff.md` `기술 검토 요청` 참고, 에픽 0089

## 진행 기록

- 2026-10-10: 생성(0092 디자인 작업 중 발견, 이 에픽 범위 밖).
