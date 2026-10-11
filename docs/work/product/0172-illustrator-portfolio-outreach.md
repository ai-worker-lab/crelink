# 0172 일러스트 대표작·문의처 자사 안내

- 단계: 티켓
- 역할: product
- 상태: 검증
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-12

## 목적

단기 3~7일 P1. 공개 가능한 일러스트 대표작은 있지만 작업 역할·이용 조건·문의처를 분리하지 못한 크리에이터에게 기존 크리링 기능으로 직접 작성할 안내를 제공합니다. 사용자 2026-10-12 무료 외부 홍보 위임에 따른 PM AI 승인입니다. 고객 수요·효과는 미검증입니다.

## 수용 기준

- [x] 공식 원문과 현행 입력 계약을 확인해 원본 링크 안내와 이미지 재업로드 대안을 비교하고 완성 자사 안내를 만듭니다.
- [x] localhost 실제 HTTP와 390px·1280px 브라우저에서 본문·링크·가로 넘침을 확인합니다. 서비스 저장/DB 검증과 구분합니다.
- [x] PM이 회사 공개 채널의 규칙·권한·무료·철회 조건과 guard 0을 확인한 뒤 개별 공개하고 URL·시각·비로그인 소비 근거를 기록합니다.
- [x] 8팀 추천/보류·관측 분모·7일 리뷰·중단 조건과 변경 기록을 연결합니다. 성장 효과·전체 0153 완료로 보고하지 않습니다.

## 범위

- 포함: 공개 권한·원본 접근·직접 저장·문의처 준비 안내 한 건, 회사 프로젝트 사용 도움말 공개.
- 제외: 새 서비스 기능·CTA 변경·새 캠페인 보상·개별 발송·Behance 가입/게시·고객 작품 수집·운영 계정/DB 시험·지출/약정.

## 위험·복구

공개 작품이라는 이유로 복제/상업 이용 권한이 있다고 안내하지 않습니다. 정책 경고·사실 불일치면 PM이 guard 뒤 이번 안내만 수정해 철회 표시하며 사용자 댓글·링크·보너스는 삭제하지 않습니다. 기존 회사 소개 Discussion #111의 CTA와 본문은 보존합니다.

## 연결

- [실제 안내 원본](../../product/growth/illustrator-portfolio-guide.md)
- [팀별 조사](../../product/research/crelink-growth-team-research.md)
- [무료 모집 실행](0153-acquisition-human-requests.md)
- [운영 헌장](../../ops/ai-operator.md)

## 진행 기록

- 2026-10-12 PM `549c2c09-6792-41cd-9355-c2eac370821f`: Product 순환 새 심층을 직접 수행. 질문은 공개 작품의 재사용 권한, 원본 링크/복제의 차이, 직접 입력 필드, 안전한 공개/철회/관측입니다. Behance 공식 저작권 설정·게시 안내 원문은 공개 열람과 이용 권한을 구분하며 자료 갱신일은 2019/2020으로 UI 최신성은 보장하지 않습니다. 크리링 PortfolioForm의 title/url/description·명시 저장을 확인했습니다. 단일 작은 소재는 PM 직접 처리하며 새 Orca Run/Task/Dispatch·전문 워커 호출은 없습니다.
- 실제 공개: guard0→공식 `createDiscussion`, [#116](https://github.com/ai-worker-lab/crelink/discussions/116), `2026-10-11T20:04:51Z`(10/12 05:04:51 KST). 회사 repository ADMIN·GitHub AUP4/10·기존 무료 기능을 확인했습니다. 신규결제/약정0, 모델비용/토큰 미확인. 기존 #111·CTA 변경 없음. 비로그인 Chromium 두 폭의 본문/권리 경고/수동 저장/서비스 링크·가로넘침 없음, 서비스 운영 링크 클릭0입니다.
- localhost `127.0.0.1:64345` 실제 HTTP와 Chromium390/1280 원문 소비 확인, PNG20초 timeout 신고·미확보. 임시 서버/브라우저 종료, 서비스 API/DB 시험·합성사용자 생성 없음. 원본 콘텐츠와 공개 렌더링 검증이지 실제 수요 시험은 아닙니다.
- 검증: 고정 pnpm10.10.0 `pnpm verify --docs` work142/docs256/design29 통과·odlint 미설치skip. 기존 main yaml만 ignored node_modules에 임시 연결해 `node scripts/work-scope.mjs 0172 --base origin/main` 5파일 통과 후 연결/디렉터리 제거했습니다. 최종 문서 변경을 PR로 보존하며 당일 merged PR108/109/110/103/104/112/106/113 8건 상한으로 main/새Deploy 없음. PR114/115와 본 기록을 다음 허용일에 누락 없이 통합합니다.
- SRE/Release: 정확한 repository5 worktree와 automation provenance를 대조했습니다. run43 `4f178bf9-71bd-4a87-a40b-7baa9e1a5a98`와 run44 `4505b6d8-8640-4152-a89d-0558e8d0f2e7` completed여도 미병합 PR114/115로 보존, 현재45 `b84f38ba-36cf-4c0c-a5f1-8fcb7173ad16` dispatched·main·사용자소유 legacy activation은 보존합니다. 삭제후보0이라 삭제 전 clean/ancestor/idle·instance-destroy 단계는 실행하지 않았습니다. 첫 repo path 조회는 repo_not_found 뒤 정확한 id로 재조회 성공입니다.
- PM/Orca: 현재 automation provideromp·extraAgentArgs 명시Sol·PM 신원 확인. terminal show의 agentWaitnull이라 실효 모델 구조화 receipt·비용/입출력토큰 미확인. 새 워커/Delivery/Task/Dispatch 없음. legacy `task_4794a89c6e03`/`ctx_9f2c6510908d` user_owned·retained/start_unknown/unverifiable은 소유권/종료 확정 전 재시작·편집·정리하지 않습니다. 일반 완료자동화 삭제와 settlement를 혼동하지 않았습니다.
- 다음: 공개/문서 단계 수용 기준은 충족했으나 기록의 main 통합·7일 효과 관측은 별개이며 상태 검증을 유지합니다. **10/19 05:04:51 KST** 이후 동일정의 전체 가입/첫링크/실사용자·존속/경고를 관측합니다. 원인 분리/타깃 분모 미관측, 가입5미만 표본부족, 경고/불일치시 guard뒤 이번 안내만 철회 표시합니다. Growth 새 근거 순환을 우선하고 H1~H5 접근/동의/준수 선행은 비용 승인으로 분류하지 않습니다.
