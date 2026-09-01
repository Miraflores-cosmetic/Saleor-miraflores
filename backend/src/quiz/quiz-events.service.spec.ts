import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { QuizEventsService } from './quiz-events.service';

vi.mock('../dashboard/dashboard-period.util', () => ({
  moscowDateString: () => '2026-09-01',
  moscowDayStart: (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  },
  moscowDayEndExclusive: (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  },
}));

function makePrisma() {
  return {
    quizEvent: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  };
}

describe('QuizEventsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: QuizEventsService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new QuizEventsService(prisma as never);
  });

  describe('resolvePeriod', () => {
    it('defaults to 30d ending today (Moscow)', () => {
      const range = svc.resolvePeriod({});
      expect(range.kind).toBe('30d');
      expect(range.toDate).toBe('2026-09-01');
      expect(range.fromDate).toBe('2026-08-03');
    });

    it('supports 7d / 90d presets', () => {
      expect(svc.resolvePeriod({ period: '7d' }).fromDate).toBe('2026-08-26');
      expect(svc.resolvePeriod({ period: '90d' }).fromDate).toBe('2026-06-04');
    });

    it('parses custom from/to', () => {
      const range = svc.resolvePeriod({
        period: 'custom',
        from: '2026-08-01',
        to: '2026-08-10',
      });
      expect(range.kind).toBe('custom');
      expect(range.fromDate).toBe('2026-08-01');
      expect(range.toDate).toBe('2026-08-10');
    });

    it('rejects inverted custom range', () => {
      expect(() =>
        svc.resolvePeriod({
          period: 'custom',
          from: '2026-08-10',
          to: '2026-08-01',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('ingest', () => {
    it('writes events with optional userId', async () => {
      prisma.quizEvent.createMany.mockResolvedValue({ count: 2 });
      const res = await svc.ingest(
        [
          {
            sessionId: 'session-001',
            type: 'quiz_start',
          },
          {
            sessionId: 'session-001',
            type: 'zone_select',
            zone: 'face',
            stepKey: 'zone',
            meta: { zone: 'face' },
          },
        ] as never,
        'user-1',
      );

      expect(res).toEqual({ accepted: 2 });
      expect(prisma.quizEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            sessionId: 'session-001',
            type: 'quiz_start',
            userId: 'user-1',
          }),
          expect.objectContaining({
            sessionId: 'session-001',
            type: 'zone_select',
            zone: 'face',
            stepKey: 'zone',
            userId: 'user-1',
          }),
        ],
      });
    });
  });

  describe('getOverview', () => {
    it('aggregates starts, completions, zones and funnel', async () => {
      prisma.quizEvent.findMany
        .mockResolvedValueOnce([
          { sessionId: 's1', createdAt: new Date('2026-08-20T10:00:00Z') },
          { sessionId: 's2', createdAt: new Date('2026-08-21T10:00:00Z') },
        ])
        .mockResolvedValueOnce([
          {
            sessionId: 's1',
            createdAt: new Date('2026-08-20T10:05:00Z'),
            zone: 'face',
            meta: { blockKeys: ['step_1_spf', 'face_edema'] },
          },
        ])
        .mockResolvedValueOnce([
          { meta: { blockKeys: ['step_1_spf', 'face_edema'] }, zone: 'face' },
        ]);

      prisma.quizEvent.groupBy
        .mockResolvedValueOnce([
          { stepKey: 'age', _count: { _all: 2 } },
          { stepKey: 'spf', _count: { _all: 1 } },
        ])
        .mockResolvedValueOnce([{ stepKey: 'age', _count: { _all: 1 } }])
        .mockResolvedValueOnce([
          { zone: 'face', _count: { _all: 2 } },
          { zone: 'hair', _count: { _all: 1 } },
        ]);

      const res = await svc.getOverview({ period: '30d' });

      expect(res.starts).toBe(2);
      expect(res.completions).toBe(1);
      expect(res.conversionRate).toBe(50);
      expect(res.zones).toEqual({ face: 2, hair: 1 });
      expect(res.avgDurationSec).toBe(300);
      expect(res.topResultBlocks[0]).toEqual({ key: 'step_1_spf', count: 1 });
      expect(res.funnel.find((f) => f.key === 'age')?.views).toBe(2);
      expect(res.period.kind).toBe('30d');
    });
  });
});
