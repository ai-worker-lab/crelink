import { Module } from '@nestjs/common';
import { ActorPolicy } from './actor-policy';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthLibraryOAuth, GoogleOAuth } from './google-oauth';
import { OperatorGuard, OptionalSessionGuard, SessionGuard } from './session.guard';

// 가드는 쓰는 모듈의 주입기에서 만들어지므로 가드가 받는 provider(AuthService·ActorPolicy)도 함께 내보냅니다.
@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    ActorPolicy,
    SessionGuard,
    OptionalSessionGuard,
    OperatorGuard,
    { provide: GoogleOAuth, useClass: GoogleAuthLibraryOAuth },
  ],
  exports: [AuthService, ActorPolicy, SessionGuard, OptionalSessionGuard, OperatorGuard],
})
export class AuthModule {}
