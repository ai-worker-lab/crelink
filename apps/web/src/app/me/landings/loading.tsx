// 관리 화면 레이아웃(`[publicId]/layout.tsx`)이 편집 상태를 부르는 동안 보이는 뼈대. `/me`(서버 이동)에는 Suspense 경계를 두지 않아
// 이동이 HTTP 307로 나갑니다.
export { ManagerLoading as default } from '../../../components/manage/ManagerLoading';
