import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthLibraryOAuth, GoogleOAuth } from './google-oauth';
import { OperatorGuard, SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, SessionGuard, OperatorGuard, { provide: GoogleOAuth, useClass: GoogleAuthLibraryOAuth }],
  exports: [AuthService, SessionGuard, OperatorGuard],
})
export class AuthModule {}
