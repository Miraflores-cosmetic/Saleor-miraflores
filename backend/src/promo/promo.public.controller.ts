import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ValidatePromoDto } from './dto/promo.dto';
import { PromoPublicService } from './promo.service';

@Public()
@UseGuards(ThrottlerGuard)
@Controller('promo')
export class PromoPublicController {
  constructor(private readonly promo: PromoPublicService) {}

  /** Drawer preview — client subtotal OK. Rate-limit против перебора кодов. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('validate')
  validate(@Body() dto: ValidatePromoDto) {
    return this.promo.validate(dto.code, dto.subtotal, {
      email: dto.email,
      guestId: dto.guestId,
    });
  }
}
