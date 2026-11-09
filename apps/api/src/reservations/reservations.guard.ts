import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config.service';

/**
 * 사전 신청 경로 전체의 플래그(R31). `RESERVATIONS_ENABLED`가 정확히 `true`가 아니면 없는 경로와 같은 404(`not_found`)로 답합니다.
 * 세션 검사보다 먼저 두어 비로그인 요청도 401이 아니라 404를 받게 합니다.
 */
@Injectable()
export class ReservationsEnabledGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(): boolean {
    if (!this.config.reservationsEnabled) throw new NotFoundException();
    return true;
  }
}
