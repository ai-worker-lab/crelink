import type { Metadata } from 'next';
import { InstagramDeliveries } from '../../../../../../components/manage/instagram-deliveries/InstagramDeliveries';

export const metadata: Metadata = { title: '발송 내역 · 인스타그램 DM', robots: { index: false } };

export default async function InstagramDeliveriesPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <InstagramDeliveries key={publicId} publicId={publicId} />;
}
