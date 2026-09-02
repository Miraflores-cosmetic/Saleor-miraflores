import { Module } from '@nestjs/common';
import { OnecController } from './onec.controller';
import { OnecService } from './onec.service';
import { OnecSessionStore } from './onec-session';

@Module({
  controllers: [OnecController],
  providers: [OnecService, OnecSessionStore],
})
export class OnecModule {}
