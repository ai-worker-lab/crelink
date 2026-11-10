import { CRELINK_API_PATHS, type CreatorLandingState, type MeResponse } from '@crelink/shared';
import * as Sentry from '@sentry/nextjs';
import type { ReactNode } from 'react';
import { ErrorPanel } from '../../../../components/ErrorPanel';
import { FeedbackButton } from '../../../../components/FeedbackButton';
import { MonitoringUser } from '../../../../components/MonitoringUser';
import { ManagerProvider } from '../../../../components/manage/ManagerContext';
import { ManagerProfileMenu } from '../../../../components/manage/ManagerProfileMenu';
import { ManagerShell } from '../../../../components/manage/ManagerShell';
import { managerHref } from '../../../../components/manage/menu';
import { ProfileMenu } from '../../../../components/manage/ProfileMenu';
import { SiteHeader } from '../../../../components/SiteHeader';
import { loadSignedIn } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * 랜딩 관리 화면(PRD R18) 틀: 머리글과 메뉴·미리보기 무대·편집 패널. 메뉴(`components/manage/menu.tsx`)마다 이 아래 page가 하나씩 있고,
 * 편집 상태(`GET /api/me/landing`)와 저장하지 않은 입력·고른 대상은 이 레이아웃의 `ManagerProvider`가 들고 있어 메뉴를 옮겨도 남습니다.
 * 공개 페이지 열기·단축 주소는 무대의 주소 막대에, 이메일·운영자 화면·로그아웃은 머리글 프로필 메뉴에 있습니다. 프로필 사진을 저장 직후 반영하려고
 * 정상 화면의 머리글은 `ManagerProvider` 안에 둡니다. 401은 홈(`/`)으로, 남의 랜딩 ID는 찾을 수 없음 안내, 그 밖의 API 오류는 다시 시도 안내입니다.
 */
export default async function ManageLandingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const [result, me] = await Promise.all([
    loadSignedIn<CreatorLandingState>(CRELINK_API_PATHS.meLanding),
    loadSignedIn<MeResponse>(CRELINK_API_PATHS.me),
  ]);
  // 로그인 사용자의 내부 ID만 이 요청(서버)과 브라우저의 Sentry 이벤트에 붙입니다. 이메일은 넣지 않습니다.
  if (me.ok) Sentry.setUser({ id: me.data.id });
  const own = result.ok && result.data.landing.publicId === publicId ? result.data : null;
  const email = me.ok ? me.data.email : null;
  const isOperator = me.ok && me.data.role === 'operator';
  const errorHeader = (
    <SiteHeader>
      <ProfileMenu email={email} isOperator={isOperator} avatarUrl={null} />
    </SiteHeader>
  );
  return (
    <div className="app-page manager-page">
      {me.ok ? <MonitoringUser id={me.data.id} /> : null}
      {!result.ok ? (
        <>
          {errorHeader}
          <main className="app-main">
            {/* `다시 시도`는 문서를 새로 불러옵니다. 클라이언트 이동은 이 공유 레이아웃을 다시 렌더하지 않아 조회를 다시 하지 않습니다. */}
            <ErrorPanel
              title="편집 화면을 불러오지 못했어요."
              message={result.error.message}
              action={{ href: managerHref(publicId, ''), label: '다시 시도', reload: true }}
            />
          </main>
        </>
      ) : !own ? (
        <>
          {errorHeader}
          <main className="app-main">
            <ErrorPanel
              title="랜딩페이지를 찾을 수 없어요."
              message="주소가 바뀌었거나 내 랜딩페이지가 아니에요. 내 크리링에서 관리 화면으로 다시 들어와 주세요."
              action={{ href: '/me', label: '내 크리링으로' }}
            />
          </main>
        </>
      ) : (
        <ManagerProvider initial={own}>
          <SiteHeader>
            <ManagerProfileMenu email={email} isOperator={isOperator} />
          </SiteHeader>
          <ManagerShell>{children}</ManagerShell>
        </ManagerProvider>
      )}
      <FeedbackButton />
    </div>
  );
}
