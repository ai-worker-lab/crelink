import { CurrentPage, PageAccessGuard } from '../pages/page-access.guard';
import { PageContext } from '@crelink/shared';
import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  InstabioImportPreview,
  InstabioImportResult,
  parseSignupContextHeader,
  SIGNUP_CONTEXT_HEADER,
} from '@crelink/shared';
import { SessionGuard } from '../auth/session.guard';
import { InstabioImportService } from './instabio-import.service';

@Controller('me/imports/instabio')
@UseGuards(SessionGuard, PageAccessGuard)
export class InstabioImportController {
  constructor(private readonly imports: InstabioImportService) {}

  @Post('preview')
  @HttpCode(200)
  preview(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<InstabioImportPreview> {
    return this.imports.preview(page.ownerUserId, body);
  }

  @Post()
  @HttpCode(200)
  apply(
    @CurrentPage() page: PageContext,
    @Body() body: unknown,
    @Headers(SIGNUP_CONTEXT_HEADER) signupContext: unknown,
  ): Promise<InstabioImportResult> {
    return this.imports.apply(page.ownerUserId, body, parseSignupContextHeader(signupContext).inAppKind);
  }
}
