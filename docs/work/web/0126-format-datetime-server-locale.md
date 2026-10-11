# 0126 서버 렌더 날짜·시각 표기가 브라우저와 다름(오전/오후·PM)

- 단계: 티켓
- 역할: web
- 상태: 완료
- 종류: 결함
- 우선순위: P3
- 작성일: 2026-10-10

## 목적

로컬 Node 22.23(ICU 78)에서 `Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })`가 `2026. 11. 30. PM 11:59`를 돌려주고, Chromium은 `오후 11:59`를 돌려줍니다. 서버 렌더 화면(홈·운영자 화면)의 `formatDateTime` 결과가 브라우저와 다르게 보일 수 있고, 같은 값을 서버·클라이언트가 함께 그리면 하이드레이션 불일치가 날 수 있습니다. 0092 디자인 작업(`design/slot-event/handoff.md` 기술 검토 요청 참고)에서 발견했습니다.

## 수용 기준

- [x] 운영 Node 버전에서 `formatDate`·`formatDateTime`(`apps/web/src/lib/format.ts`)의 서버 결과가 브라우저와 같은 표기(`오전`·`오후`)인지 확인하고, 다르면 고정 형식으로 바꿉니다. 확인: 단위 테스트.

## 범위

- 포함: `apps/web/src/lib/format.ts`의 날짜·시각 형식.
- 제외: 그 밖의 화면 변경.

## 위험·복구

해당 없음(표기만).

## 연결

- 발견: `design/slot-event/handoff.md` `기술 검토 요청` 참고, 에픽 0089

## 진행 기록

- 2026-10-10: 생성(0092 디자인 작업 중 발견, 이 에픽 범위 밖).
- 2026-10-11: 사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인으로 분류했습니다. PR #103은 최종 CI 통과 후 일일 병합 상한 대기, 0164는 배포 후 7일 표본 대기, 다른 모집·개인정보 후보는 사람 승인 대기이므로 비용·외부 계정 없이 확인할 수 있는 이 결함을 선택했습니다. 운영 기준은 `apps/web/Dockerfile`의 `node:24-slim`, 로컬 기준은 `.nvmrc`의 Node 24이며 `apps/web/package.json`은 Node >=24.9를 요구합니다. Node 22 보고를 무시하거나 같은 환경에서 재확인하지 않고 지원 런타임과 Chromium의 실제 원본 함수 결과를 비교한 뒤, 차이가 있을 때만 형식을 바꿉니다. 실행 `60f592b7-c5f4-4beb-8c17-c593d71c54c8`.
- 2026-10-11: `work/0126-format-datetime-server-locale`·Orca worktree `0126-format-datetime-server-locale`에서 직접 착수했습니다. 지원 Node 24.18.0(ICU 78.3)의 `formatDateTime('2026-11-30T14:59:00Z')`는 이미 `2026. 11. 30. 오후 11:59`입니다. 코드 변경을 먼저 넣지 않고 Linux slim 런타임·Chromium에서 자정·정오·월/연도 경계까지 비교합니다.
- 2026-10-11: 지원 런타임에서 검증 완료했습니다. macOS Node 24.18.0(ICU 78.3)과 로컬 `node:24.18.0-bookworm-slim` 컨테이너가 실제 `format.ts`를 import해 8개 ISO 입력의 날짜·시각을 단언했고, Chromium 150은 같은 파일을 Node 내장 `stripTypeScriptTypes`로 타입만 지운 ES 모듈로 불러 동일 결과를 확인했습니다. 자정(`오전 12:00`)·정오(`오후 12:00`)·정오 직전·분 0 채움·한국 시간 연도 경계·윤년 2월 29일·3월 1일·명시 `+09:00` 입력이 포함됩니다. 유효하지 않은 입력은 두 함수 모두 서버·브라우저에서 `RangeError`를 유지했습니다. 기존 `node --test apps/web/src/lib/format.spec.ts` 1건도 통과했습니다.
- 2026-10-11: 로컬 throwaway 화면에서 서버 렌더 문자열과 브라우저 함수 결과가 일치하고 390px·1280px 가로 넘침 및 콘솔·페이지 오류가 없음을 확인했습니다. 390px 캡처는 성공했고 1280px 전체 캡처는 도구 timeout이라 시각 증거로 주장하지 않습니다. 실제 Next.js 홈·운영자 화면이나 운영 서버를 다시 실행·조회한 것은 아닙니다. 조사 결론은 지원 Node 24에서 기존 표기가 이미 일치하므로 포맷 코드·호출부·영구 테스트·제품 문서·웹 변경 기록을 변경하지 않는 것입니다. Node 22의 기존 보고는 당시 사실로 보존하며, 런타임/ICU를 갱신할 때 차이가 보고되면 이 항목을 재개합니다.
- 2026-10-11: `pnpm verify --docs`의 work·docs·design 3단계와 `node scripts/work-scope.mjs 0126 --base origin/main`을 통과했습니다(OpenDesign 미설치로 `od lint`만 건너뜀). 범위 검사는 새 worktree에 `yaml`이 없어 처음 실패했으며 기존 0109 설치의 해당 패키지만 임시로 연결해 해결했습니다. 변경 파일은 이 티켓과 루트 `CHANGELOGS.md` 2개뿐입니다. 다음에 할 일: 문서 PR의 최종 CI를 확인하고 2026-10-12 Asia/Seoul 이후 일일 병합 수·최신 main·직전 guard 조건에서 병합합니다. 0109 PR #103의 도구 복구를 우선하며 이 조사 기록을 활성화 성과나 운영 배포로 보고하지 않습니다.
