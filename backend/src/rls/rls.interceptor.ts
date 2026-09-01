import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { rlsAls } from './rls-context';

/**
 * На каждый HTTP-запрос: transaction-local GUCs app.user_id / app.rls_bypass.
 * Покупатель (role=USER) — только свои строки; staff / anonymous / public — bypass.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (rlsAls.getStore()) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload | null }>();
    const user = req.user ?? null;
    const isBuyer = user?.role === 'USER' && Boolean(user.sub);
    const bypass = !isBuyer;
    const userId = isBuyer ? String(user!.sub) : '';

    return from(
      this.prisma.runInRlsTransaction({ userId, bypass }, () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}
