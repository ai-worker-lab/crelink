import { Module } from '@nestjs/common';
import { LandingPassService } from './landing-pass.service';

/** 통과 표시를 발급하는 단축 도메인(ShortLinkModule)과 검증하는 공개 랜딩(CreatorModule)이 같은 키 인스턴스를 쓰도록 나눈 모듈. */
@Module({
  providers: [LandingPassService],
  exports: [LandingPassService],
})
export class LandingPassModule {}
