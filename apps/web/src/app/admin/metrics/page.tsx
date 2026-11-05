import type { Metadata } from 'next';
import { AdminAnalyticsPage } from '../../../components/analytics/AnalyticsPage';
import type { AnalyticsSearch } from '../../../lib/analytics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '지표 · 운영자', robots: { index: false } };

export default function MetricsPage({ searchParams }: { searchParams: Promise<AnalyticsSearch> }) {
  return <AdminAnalyticsPage searchParams={searchParams} mode="metrics" />;
}
