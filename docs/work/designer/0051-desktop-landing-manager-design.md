# 0051 PC 랜딩 관리 화면 디자인(왼쪽 관리 패널·오른쪽 휴대폰 미리보기)

- 단계: 티켓
- 역할: designer
- 상태: 진행
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-08

## 목적

지금 크리에이터 관리 화면은 두 곳으로 나뉩니다. `/me`(단축 주소·프로필·SNS·포트폴리오·외부 링크 요약)와 `/me/landings/{publicId}`(외부 링크 편집·보기 모드, 방명록 켜고 끄기)입니다. 둘 다 한 열 배치라 PC에서는 화면이 비고, 고친 결과를 보려면 보기 모드나 공개 페이지로 옮겨 가야 합니다. 사용자는 인포크링크 관리 화면(왼쪽 관리 패널, 오른쪽 휴대폰 모양 미리보기)처럼 PC에서 모바일 랜딩을 꾸미는 관리 화면을 원합니다.

## 수용 기준

- [ ] OpenDesign 시안이 1280px에서 왼쪽 관리 패널과 오른쪽 휴대폰 모양 실시간 미리보기를 보여 주고, 패널에서 지금 관리 화면 두 곳의 기능(단축 주소 확인·복사·변경, 프로필, SNS, 외부 링크 추가·수정·삭제·순서·숨기기, 포트폴리오, 방명록 켜고 끄기)을 모두 다룬다.
- [ ] 390px 배치(미리보기 전환 방법 포함)와 빈 상태·저장 중·저장 실패·한도 도달(R13)·차단 링크(R14) 상태가 시안과 `handoff.md`에 있다.
- [ ] 사용자가 시안을 승인한다.
- [ ] `design/desktop-landing-manager/`에 산출물과 `handoff.md`가 있고 `pnpm design:check --require-lint`가 통과한다.

## 범위

- 포함: 관리 화면 정보 구조, PC·휴대폰 배치, 상태, 인계 문서.
- 제외: 웹 구현(승인 뒤 기술 설계와 web 티켓으로 나눔), 새 블록 종류·꾸미기(테마)·크리에이터용 통계(PRD R5·R10에서 제외).

## 위험·복구

해당 없음(디자인 산출물만 추가).

## 연결

- 계기: 2026-10-08 사용자 요청("이런 느낌으로 pc에서는 모바일 랜딩 페이지를 구성할 수 있는 관리 페이지 중점으로 구성할 수 있는 UI/UX를 만들고 싶어", 인포크링크 관리 화면 스크린숏 첨부)
- 제품 요구: [PRD R12·R13·R14·R16·R17·R18·R19](../../product/crelink.md#요구사항)
- 유사 서비스: [인포크링크 편집 화면](../../product/research/link-in-bio-benchmark.md#인포크링크-편집-화면로그인-후-확인), [리틀리 편집 화면](../../product/research/link-in-bio-benchmark.md#리틀리-편집-화면로그인-후-확인), [인링크 마이링크 편집](../../product/research/link-in-bio-benchmark.md#마이링크-편집httpsinlinktomylinkedit)
- 지금 화면: `apps/web/src/app/me/page.tsx`, `apps/web/src/app/me/landings/[publicId]/page.tsx`, `apps/web/src/components/manage/LandingEditor.tsx`
- 기준: [OpenDesign 사용 기준](../../../design/docs/opendesign.md), [디자인 시스템](../../../design/system/DESIGN.md)

## 진행 기록

- 2026-10-08: 생성. 브랜치 `work/0051-desktop-landing-manager-design`는 방명록(0050) 브랜치 위에서 시작함(관리 화면에 방명록 켜고 끄기가 들어가야 해서). `pnpm design:sync`로 `user:crelink` 설치 확인.
- 2026-10-08: 사용자 답변(OpenDesign brief): 대상 화면 PC 중심 + 휴대폰 반응형, 완성도 실제 제품 수준(`user:crelink` 스튜디오 라이트). 관리 범위는 "계속 늘려나갈 것이다. inlink나 다른 벤치마킹 사이트들처럼 기능을 늘려나갈 거다" → 지금 관리 화면 두 곳을 한 관리 화면으로 모으고, 나중에 메뉴(디자인·통계·문의 등)를 더할 수 있는 화면 틀(product shell)로 설계. 미리보기 위치는 첨부 스크린숏(인포크)대로 오른쪽.
- 2026-10-08: 시안 인계(사용자 승인 전). OpenDesign 프로젝트 `crelink-desktop-landing-manager`(디자인 시스템 `user:crelink`, Local Codex, `example-web-prototype`)에서 생성 1회 + 다듬기 6회(첫 렌더 누락, 미리보기 링크 회귀, 포트폴리오 카드 누락, 숨김 행 흐림 범위, 스위치 이름, PC 링크 추가 폼 누락, 폼 오류 미표시, 상태 보드 컴포넌트 깨짐을 브라우저로 확인해 고침). 산출물 `design/desktop-landing-manager/index.html`(눌러 볼 수 있는 시안)·`states.html`(상태 24개)·`handoff.md`. 선택: 메뉴 3개(페이지 편집·방명록·주소 설정)를 `/me/landings/{publicId}/…` 아래에 두는 확장형 틀, 카드 순서는 공개 랜딩 순서로 고정, PC 링크 추가·수정은 미리보기를 가리지 않는 패널 안 펼침(390px은 하단 시트 유지), 휴대폰 메뉴는 위쪽 가로 탭 + 떠 있는 `미리보기` 버튼. 새 토큰·새 API 없음(웹 단독 구현으로 판단, `orchestrator` 디자인 기술 검토는 아직). 사용자 결정 필요: PRD R18 문장 변경(편집·보기 모드 → 패널+미리보기, PC 펼침 편집), `/me`·`/me/landings` 주소 통합, 저장 방식 통일 여부. 검증: Playwright로 1280·1100·390·320px 열어 정렬(키보드·마우스)·숨기기·링크 추가·차단 도메인 오류·저장 실패·주소 변경·방명록 숨기기·전체 화면 미리보기·하단 시트 확인(가로 넘침 없음), `pnpm design:check --require-lint` 통과(`디자인 산출물 검사 통과: 파일 9개, 산출물 HTML 2개`, od lint P2 알림만). 확인 못 함: 실제 터치 끌기, 스크린리더 낭독, 1024~1199px 2단 배치.
