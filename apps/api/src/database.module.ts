import { Global, Module } from '@nestjs/common';
import { Database } from './database';
import { AppConfig } from './config.service';

@Global()
@Module({ providers: [Database, AppConfig], exports: [Database, AppConfig] })
export class DatabaseModule {}
