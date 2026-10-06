import type { Metadata } from 'next';
import '@crelink/design-tokens/tokens.css';
import '../styles.css';

export const metadata: Metadata = {
  title: { default: 'crelink', template: '%s | crelink' },
  description: 'crelink',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
