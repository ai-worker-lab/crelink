import * as Sentry from '@sentry/nextjs';

/** 서버가 시작할 때 런타임별 Sentry 설정을 불러옵니다(`NEXT_PUBLIC_SENTRY_DSN`이 비면 초기화하지 않음). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

/** Server Component·route handler·proxy에서 난 서버 오류를 Sentry로 보냅니다. Sentry가 꺼져 있으면 아무것도 하지 않습니다. */
export const onRequestError = Sentry.captureRequestError;
