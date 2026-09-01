import { Module } from '@nestjs/common';
import { QuizAdminController } from './quiz-admin.controller';
import { QuizPublicController } from './quiz.public.controller';
import { QuizEventsService } from './quiz-events.service';

@Module({
  controllers: [QuizPublicController, QuizAdminController],
  providers: [QuizEventsService],
})
export class QuizModule {}
