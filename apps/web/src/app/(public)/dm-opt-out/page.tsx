import type { Metadata } from 'next';
import { DmOptOut } from './DmOptOut';

export const metadata: Metadata = {
  title: 'DM 수신 거부',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** 공개 화면. 토큰은 서버가 볼 수 없는 URL 프래그먼트(`#t=`)이므로 서버에서는 아무것도 읽지 않습니다. */
export default function Page() {
  return <DmOptOut />;
}
