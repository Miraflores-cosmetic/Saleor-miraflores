import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { TrackQuizEventsDto } from './dto/track-quiz-events.dto';
import { QuizEventsService } from './quiz-events.service';

@Public()
@Controller('quiz')
@UseGuards(ThrottlerGuard)
export class QuizPublicController {
  constructor(private readonly quizEvents: QuizEventsService) {}

  @Post('events')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  track(@Body() body: TrackQuizEventsDto, @Req() req: Request & { user?: JwtPayload | null }) {
    const userId =
      req.user?.role === 'USER' && req.user.sub ? String(req.user.sub) : null;
    return this.quizEvents.ingest(body.events, userId);
  }
}
