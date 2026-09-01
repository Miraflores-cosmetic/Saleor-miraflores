import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QuizEventsService } from './quiz-events.service';

@Controller('quiz/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class QuizAdminController {
  constructor(private readonly quizEvents: QuizEventsService) {}

  @Get('overview')
  overview(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.quizEvents.getOverview({ period, from, to });
  }
}
