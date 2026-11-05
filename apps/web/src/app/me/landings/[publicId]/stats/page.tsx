import type { Metadata } from 'next';
import { CreatorAnalyticsPage } from '../../../../../components/analytics/AnalyticsPage';
import { managerMenuLabel } from '../../../../../components/manage/menu';
import type { AnalyticsSearch } from '../../../../../lib/analytics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: managerMenuLabel('stats'), robots: { index: false } };

export default async function StatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<AnalyticsSearch>;
}) {
  return <CreatorAnalyticsPage publicId={(await params).publicId} searchParams={searchParams} mode="stats" />;
}
