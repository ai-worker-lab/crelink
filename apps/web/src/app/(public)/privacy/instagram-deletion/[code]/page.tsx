import type { Metadata } from 'next';
import Link from 'next/link';
import { apiOrigin, apiRequestHeaders } from '../../../../../lib/api/server';
import { formatDateTime } from '../../../../../lib/format';
import { CONFIRMATION_CODE_PATTERN, deletionView, type DeletionView } from './status';

export const metadata: Metadata = { title: '인스타그램 데이터 삭제 확인', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Meta 데이터 삭제 콜백 응답의 확인 주소입니다(`apps/api/src/instagram/webhook.service.ts`). 근거: docs/specs/instagram-comment-dm.md
 * `데이터 삭제 콜백`. 확인 코드가 있는지와 처리 시각만 보여 주고 어떤 계정인지는 보여 주지 않습니다.
 */
async function load(code: string): Promise<DeletionView> {
  if (!CONFIRMATION_CODE_PATTERN.test(code)) return { kind: 'not_found' };
  if (!apiOrigin) return { kind: 'unavailable' };
  try {
    const response = await fetch(`${apiOrigin}/api/public/instagram-deletions/${code}`, {
      headers: apiRequestHeaders({ Accept: 'application/json' }),
      cache: 'no-store',
    });
    const body = response.ok ? ((await response.json().catch(() => null)) as { processedAt?: unknown } | null) : null;
    return deletionView({ status: response.status, processedAt: body?.processedAt });
  } catch {
    return { kind: 'unavailable' };
  }
}

export default async function InstagramDeletionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const view = await load(code);
  return (
    <main className="public-page narrow-page">
      <p className="brand-mark">
        <Link href="/">크리링</Link>
      </p>
      <article className="prose">
        <h1>인스타그램 데이터 삭제 확인</h1>
        {view.kind === 'processed' ? (
          <>
            <p role="status">
              삭제 요청을 {formatDateTime(view.processedAt)}에 처리했어요. 요청과 연결된 인스타그램 계정 연결이 있었다면
              그 연결과 암호화해 보관하던 접근 토큰, 규칙과 발송 내역, 그 계정의 DM 수신 거부 기록을 지웠어요.
            </p>
            <p>
              확인 코드 자체는 이 확인 페이지를 위해 처리 시각과 함께 90일 동안만 보관한 뒤 지워요. 코드가 지워지면 이
              페이지는 &lsquo;찾을 수 없음&rsquo;으로 바뀔 수 있어요.
            </p>
          </>
        ) : view.kind === 'not_found' ? (
          <>
            <p role="status">이 확인 코드의 삭제 요청을 찾을 수 없어요.</p>
            <p>
              주소가 잘못됐거나, 처리 기록을 보관하는 90일이 지나 지워졌을 수 있어요. 삭제가 필요하면 개인정보
              처리방침의 문의 경로로 알려 주세요.
            </p>
          </>
        ) : (
          <p role="status">지금은 삭제 처리 여부를 확인하지 못했어요. 잠시 뒤 다시 열어 보세요.</p>
        )}
        <p>
          자세한 처리 기준은 <Link href="/privacy#privacy-instagram">개인정보 처리방침</Link>에서 볼 수 있어요.
        </p>
      </article>
    </main>
  );
}
