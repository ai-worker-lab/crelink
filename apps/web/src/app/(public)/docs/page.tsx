import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIDE_ARTICLES, PUBLIC_DOCS } from '../../../lib/docs';

export const metadata: Metadata = { title: '문서' };

export default function DocsIndexPage() {
  return (
    <article className="prose">
      <h1>문서</h1>
      <p>크리링 사용 방법과 바뀐 점, 디자인 기준을 모아 둔 곳이에요.</p>
      <ul className="docs-list">
        {PUBLIC_DOCS.map((doc) => (
          <li key={doc.href}>
            <Link href={doc.href}>{doc.title}</Link>
            <p>{doc.description}</p>
          </li>
        ))}
      </ul>
      <section aria-labelledby="docs-articles">
        <h2 id="docs-articles">활용 가이드</h2>
        <ul className="docs-list">
          {GUIDE_ARTICLES.map((article) => (
            <li key={article.href}>
              <Link href={article.href}>{article.title}</Link>
              <p>{article.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
