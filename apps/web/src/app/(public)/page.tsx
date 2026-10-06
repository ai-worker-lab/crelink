import { API_PATHS, type ReadinessResponse } from '@crelink/shared';
import { serverApi, ServerApiError } from '../../lib/api/server';

// API·DB 준비 상태는 요청마다 확인합니다. 빌드 시점 결과가 정적 페이지로 굳지 않게 합니다.
export const dynamic = 'force-dynamic';

async function readReadiness(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await serverApi<ReadinessResponse>(API_PATHS.ready);
    return { ok: true };
  } catch (error) {
    if (error instanceof ServerApiError) return { ok: false, message: error.message };
    throw error;
  }
}

export default async function StartPage() {
  const readiness = await readReadiness();
  return (
    <main className="public-page">
      <section className="landing">
        <h1>crelink</h1>
        <p>서비스 소개는 아직 정하지 않았습니다. 이 화면은 실행 확인용 시작점입니다.</p>
        {readiness.ok ? (
          <p role="status">API·DB 상태: 정상</p>
        ) : (
          <div className="error" role="alert">
            <p>API·DB 상태: 연결 실패 — {readiness.message}</p>
          </div>
        )}
      </section>
    </main>
  );
}
