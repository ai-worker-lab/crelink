/** `GET /api/health`: API 프로세스가 응답하는지(liveness). DB 상태와 관계없이 200입니다. */
export interface HealthResponse {
  status: 'ok';
}

/**
 * `GET /api/health/ready`: 요청을 처리할 준비가 됐는지(readiness). DB까지 확인합니다.
 * 준비되지 않으면 503과 `ApiError`(`code: 'database_unavailable'`)를 반환합니다.
 */
export interface ReadinessResponse {
  status: 'ready';
}

export const API_PATHS = {
  health: '/api/health',
  ready: '/api/health/ready',
} as const;

export interface ApiError {
  code: string;
  message: string;
}

export * from './crelink.js';
