import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  moscowDateString,
  moscowDayEndExclusive,
  moscowDayStart,
} from '../dashboard/dashboard-period.util';
import type { TrackQuizEventItemDto } from './dto/track-quiz-events.dto';
import { QUIZ_FUNNEL_STEPS } from './quiz-events.constants';

export type QuizReportPeriodKind = '7d' | '30d' | '90d' | 'custom';

@Injectable()
export class QuizEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(events: TrackQuizEventItemDto[], userId?: string | null) {
    const rows: Prisma.QuizEventCreateManyInput[] = events.map((e) => ({
      sessionId: e.sessionId.trim(),
      type: e.type,
      zone: e.zone?.trim() || null,
      stepKey: e.stepKey?.trim() || null,
      userId: userId?.trim() || null,
      meta:
        e.meta && typeof e.meta === 'object' && !Array.isArray(e.meta)
          ? (e.meta as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    }));

    const result = await this.prisma.quizEvent.createMany({ data: rows });
    return { accepted: result.count };
  }

  resolvePeriod(opts: {
    period?: string;
    from?: string;
    to?: string;
  }): {
    kind: QuizReportPeriodKind;
    from: Date;
    to: Date;
    fromDate: string;
    toDate: string;
  } {
    const raw = (opts.period ?? '30d').trim().toLowerCase();
    const today = moscowDateString();

    if (raw === 'custom') {
      const fromDate = opts.from?.trim() || today;
      const toDate = opts.to?.trim() || fromDate;
      const from = moscowDayStart(fromDate);
      const to = moscowDayEndExclusive(toDate);
      if (!from || !to) {
        throw new BadRequestException('Некорректный период: from/to в формате YYYY-MM-DD');
      }
      if (from.getTime() >= to.getTime()) {
        throw new BadRequestException('Дата «с» должна быть не позже «по»');
      }
      return { kind: 'custom', from, to, fromDate, toDate };
    }

    const days = raw === '7d' ? 7 : raw === '90d' ? 90 : 30;
    const kind: QuizReportPeriodKind = days === 7 ? '7d' : days === 90 ? '90d' : '30d';
    const to = moscowDayEndExclusive(today)!;
    const fromYmd = shiftMoscowDate(today, -(days - 1));
    const from = moscowDayStart(fromYmd)!;
    return { kind, from, to, fromDate: fromYmd, toDate: today };
  }

  async getOverview(opts: { period?: string; from?: string; to?: string }) {
    const range = this.resolvePeriod(opts);
    const where: Prisma.QuizEventWhereInput = {
      createdAt: { gte: range.from, lt: range.to },
    };

    const [starts, completes, stepViews, stepCompletes, zoneSelects, completeMetas] =
      await Promise.all([
        this.prisma.quizEvent.findMany({
          where: { ...where, type: 'quiz_start' },
          select: { sessionId: true, createdAt: true },
          distinct: ['sessionId'],
        }),
        this.prisma.quizEvent.findMany({
          where: { ...where, type: 'quiz_complete' },
          select: { sessionId: true, createdAt: true, zone: true, meta: true },
        }),
        this.prisma.quizEvent.groupBy({
          by: ['stepKey'],
          where: { ...where, type: 'step_view', stepKey: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.quizEvent.groupBy({
          by: ['stepKey'],
          where: { ...where, type: 'step_complete', stepKey: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.quizEvent.groupBy({
          by: ['zone'],
          where: { ...where, type: 'zone_select', zone: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.quizEvent.findMany({
          where: { ...where, type: 'quiz_complete' },
          select: { meta: true, zone: true },
          take: 5000,
        }),
      ]);

    const startSessions = new Set(starts.map((s) => s.sessionId));
    const completeBySession = new Map<string, { createdAt: Date }>();
    for (const c of completes) {
      const prev = completeBySession.get(c.sessionId);
      if (!prev || c.createdAt < prev.createdAt) {
        completeBySession.set(c.sessionId, { createdAt: c.createdAt });
      }
    }

    const startsCount = startSessions.size;
    const completionsCount = completeBySession.size;
    const conversionRate =
      startsCount > 0 ? Math.round((completionsCount / startsCount) * 1000) / 10 : 0;

    // Среднее время: первая quiz_start сессии → первое quiz_complete
    const startBySession = new Map(starts.map((s) => [s.sessionId, s.createdAt]));
    const durationsMs: number[] = [];
    for (const [sessionId, complete] of completeBySession) {
      const startAt = startBySession.get(sessionId);
      if (!startAt) continue;
      const ms = complete.createdAt.getTime() - startAt.getTime();
      if (ms >= 0 && ms < 1000 * 60 * 60 * 3) durationsMs.push(ms);
    }
    const avgDurationSec =
      durationsMs.length > 0
        ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length / 1000)
        : 0;

    const viewByStep = new Map(
      stepViews.map((r) => [r.stepKey ?? '', r._count._all] as const),
    );
    const completeByStep = new Map(
      stepCompletes.map((r) => [r.stepKey ?? '', r._count._all] as const),
    );

    const funnel = QUIZ_FUNNEL_STEPS.map((step) => {
      let views = 0;
      let completes = 0;
      if (step.key === 'start') {
        views = startsCount;
        completes = startsCount;
      } else if (step.key === 'zone') {
        views = zoneSelects.reduce((n, r) => n + r._count._all, 0);
        completes = views;
      } else {
        views = viewByStep.get(step.key) ?? 0;
        completes = completeByStep.get(step.key) ?? 0;
      }
      return {
        key: step.key,
        label: step.label,
        zone: step.zone ?? null,
        views,
        completes,
      };
    });

    const zones = {
      face: zoneSelects.find((z) => z.zone === 'face')?._count._all ?? 0,
      hair: zoneSelects.find((z) => z.zone === 'hair')?._count._all ?? 0,
    };

    const resultBlocks: Record<string, number> = {};
    for (const row of completeMetas) {
      const meta = row.meta;
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
      const keys = (meta as { blockKeys?: unknown }).blockKeys;
      if (!Array.isArray(keys)) continue;
      for (const k of keys) {
        if (typeof k !== 'string' || !k.trim()) continue;
        const key = k.trim();
        resultBlocks[key] = (resultBlocks[key] ?? 0) + 1;
      }
    }

    const topResultBlocks = Object.entries(resultBlocks)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      period: {
        kind: range.kind,
        from: range.fromDate,
        to: range.toDate,
      },
      starts: startsCount,
      completions: completionsCount,
      conversionRate,
      avgDurationSec,
      zones,
      funnel,
      topResultBlocks,
    };
  }
}

function shiftMoscowDate(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const ny = utc.getUTCFullYear();
  const nm = utc.getUTCMonth() + 1;
  const nd = utc.getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}
