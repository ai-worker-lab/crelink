import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '릴리스 노트' };

/**
 * 공개 릴리스 노트. 원본은 저장소 루트 RELEASES.md이고 빌드 때 읽어 정적 화면으로 만듭니다(Dockerfile이 빌드 단계에 복사).
 * 파일 첫머리 안내는 저장소용이라 첫 `## `(릴리스 항목) 제목부터 끝까지만 공개합니다. 작성 규칙: RELEASES.md 첫머리.
 */
async function readReleaseEntries(): Promise<string | null> {
  // next build·next dev 모두 작업 디렉터리가 apps/web입니다(next.config.ts의 outputFileTracingRoot와 같은 기준).
  const source = await readFile(path.join(process.cwd(), '../../RELEASES.md'), 'utf8');
  const start = source.search(/^## /m);
  return start === -1 ? null : source.slice(start);
}

export default async function ReleasesPage() {
  const entries = await readReleaseEntries();
  return (
    <article className="prose">
      <h1>릴리스 노트</h1>
      {entries === null ? (
        <p className="empty-text">아직 공개한 릴리스가 없어요.</p>
      ) : (
        // 저장소에 커밋된 RELEASES.md만 렌더링합니다(사용자 입력 아님).
        <div className="release-notes" dangerouslySetInnerHTML={{ __html: await marked.parse(entries) }} />
      )}
    </article>
  );
}
