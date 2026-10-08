import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthLibraryOAuth, GoogleOAuth } from './google-oauth';
import { OperatorGuard, OptionalSessionGuard, SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    SessionGuard,
    OptionalSessionGuard,
    OperatorGuard,
    { provide: GoogleOAuth, useClass: GoogleAuthLibraryOAuth },
  ],
  exports: [AuthService, SessionGuard, OptionalSessionGuard, OperatorGuard],
})
export class AuthModule {}
