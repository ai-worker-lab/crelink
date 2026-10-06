import { CRELINK_API_PATHS, type BlockedDomainView } from '@crelink/shared';
import type { Metadata } from 'next';
import { AdminShell } from '../../../components/admin/AdminShell';
import { BlockedDomains } from '../../../components/admin/BlockedDomains';
import { loadSignedIn } from '../../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '차단 도메인 · 운영자', robots: { index: false } };

export default async function BlockedDomainsPage() {
  const result = await loadSignedIn<BlockedDomainView[]>(CRELINK_API_PATHS.adminBlockedDomains);
  return (
    <AdminShell error={result.ok ? null : result.error}>
      {result.ok ? (
        <>
          <h1 className="page-title">차단 도메인</h1>
          <p className="section-help">
            목록의 도메인으로 가는 링크는 저장할 수 없고, 추가하면 이미 있는 링크도 차단돼요.
          </p>
          <BlockedDomains domains={result.data} />
        </>
      ) : null}
    </AdminShell>
  );
}
