import { Injectable } from '@nestjs/common';

/** OAuth 연결·토큰 저장·재인증 전이. 내용은 티켓 0256이 채웁니다. */
@Injectable()
export class InstagramConnectionService {
  /**
   * 재인증 전이 공통 함수입니다. 상태 변경, 토큰 파기, `pending` 취소를 한 트랜잭션에서 하고,
   * `token_revision`이 읽은 값과 다르면 아무것도 하지 않고 false를 돌려줍니다.
   */
  async markReauthRequired(_connectionId: string, _expectedRevision: number): Promise<boolean> {
    throw new Error('티켓 0256에서 구현합니다.');
  }
}
