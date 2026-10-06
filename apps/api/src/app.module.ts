import { Module } from '@nestjs/common';
import { HealthModule } from './health.module';
import { DatabaseModule } from './database.module';

@Module({ imports: [DatabaseModule, HealthModule] })
export class AppModule {}
