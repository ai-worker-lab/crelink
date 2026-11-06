import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InstabioImportPreview, InstabioImportResult, SessionUser } from '@crelink/shared';
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
  apply(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<InstabioImportResult> {
    return this.imports.apply(user.id, body);
  }
}
