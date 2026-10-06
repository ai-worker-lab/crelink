import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiError, HealthResponse, ReadinessResponse } from '@crelink/shared';
import { Database } from './database';

@Controller('health')
export class HealthController {
  constructor(private readonly database: Database) {}

  /** liveness: 프로세스가 응답하면 성공합니다. DB를 확인하지 않습니다. */
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }

  /** readiness: DB에 질의할 수 있어야 성공합니다. */
  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.database.query('SELECT 1');
    } catch {
      const body: ApiError = { code: 'database_unavailable', message: '데이터베이스에 연결할 수 없습니다.' };
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ready' };
  }
}
