import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  InstabioImportPreview,
  InstabioImportResult,
  parseSignupContextHeader,
  SessionUser,
  SIGNUP_CONTEXT_HEADER,
} from '@crelink/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { InstabioImportService } from './instabio-import.service';

@Controller('me/imports/instabio')
@UseGuards(SessionGuard)
export class InstabioImportController {
  constructor(private readonly imports: InstabioImportService) {}

  @Post('preview')
  @HttpCode(200)
  preview(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<InstabioImportPreview> {
    return this.imports.preview(user.id, body);
  }

  @Post()
  @HttpCode(200)
  apply(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Headers(SIGNUP_CONTEXT_HEADER) signupContext: unknown,
  ): Promise<InstabioImportResult> {
    return this.imports.apply(user.id, body, parseSignupContextHeader(signupContext).inAppKind);
  }
}
