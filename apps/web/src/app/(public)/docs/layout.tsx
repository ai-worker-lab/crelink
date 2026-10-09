import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsNav } from '../../../components/docs/DocsNav';
import { crelinkOpenGraph } from '../../../lib/site';

/** 문서 아래 화면 모두 같은 크리링 소개 미리보기를 씁니다(제목은 화면마다 `title`이 바뀜). */
export const metadata: Metadata = {
  openGraph: crelinkOpenGraph('크리링 문서', '크리링 사용 안내, 릴리스 노트, 브랜드와 디자인.'),
};

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="public-page narrow-page">
      <p className="brand-mark">
        <Link href="/">크리링</Link>
      </p>
      <DocsNav />
      {children}
    </main>
  );
}
