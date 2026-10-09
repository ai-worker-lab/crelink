import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CRELINK_LIMITS, SessionUser, UploadFileResponse } from '@crelink/shared';
import type { Response } from 'express';
import { apiError } from '../common/http';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { FilesService, IMAGE_TOO_LARGE_MESSAGE } from './files.service';

/** multer 크기 제한 초과(413)를 계약의 400 `file_too_large`로 바꿉니다. */
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.BAD_REQUEST)
      .json({ code: 'file_too_large', message: IMAGE_TOO_LARGE_MESSAGE });
  }
}

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('me/files')
  @UseGuards(SessionGuard)
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CRELINK_LIMITS.imageMaxBytes, files: 1 } }))
  async upload(
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadFileResponse> {
    return this.files.upload(user.id, file);
  }

  /** 공개 이미지. id는 추측하기 어려운 UUID이며 내용이 바뀌지 않으므로 오래 캐시합니다. */
  @Get('files/:id')
  async read(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const file = await this.files.read(id);
    if (!file) throw apiError(HttpStatus.NOT_FOUND, 'file_not_found', '이미지를 찾을 수 없습니다.');
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': file.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(file.data);
  }
}
