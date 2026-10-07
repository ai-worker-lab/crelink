import Link from 'next/link';
import { DocsNav } from '../../../components/docs/DocsNav';

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
