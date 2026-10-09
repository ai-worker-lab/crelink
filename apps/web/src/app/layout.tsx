import type { Metadata } from 'next';
import '@crelink/design-tokens/tokens.css';
import '../styles.css';
import { SITE_DESCRIPTION, SITE_URL } from '../lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: '크리링', template: '%s | 크리링' },
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
