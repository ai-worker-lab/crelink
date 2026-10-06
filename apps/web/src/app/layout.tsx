import type { Metadata } from 'next';
import '@crelink/design-tokens/tokens.css';
import '../styles.css';

export const metadata: Metadata = {
  title: { default: '크리링', template: '%s | 크리링' },
  description: '인스타그램 프로필 링크 하나로 SNS·포트폴리오·외부 링크를 모아 보여 주는 크리에이터 랜딩페이지, 크리링.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
