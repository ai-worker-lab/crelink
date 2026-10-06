import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AppConfig implements OnModuleInit {
  onModuleInit() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  }
}
