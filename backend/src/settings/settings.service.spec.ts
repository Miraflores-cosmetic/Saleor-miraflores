import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsAdminService, SettingsPublicService } from './settings.service';

function makeRow(partial: {
  id: string;
  question?: string;
  answer?: string;
  sortOrder?: number;
  active?: boolean;
}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: partial.id,
    question: partial.question ?? 'Q',
    answer: partial.answer ?? 'A',
    sortOrder: partial.sortOrder ?? 0,
    active: partial.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

function makePrisma() {
  return {
    faqItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    heroSlide: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    homepageSet: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    quizContentEntry: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

describe('SettingsAdminService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: SettingsAdminService;

  beforeEach(() => {
    prisma = makePrisma();
    const storage = {
      tryPublicUrlToKey: vi.fn(() => null),
      deleteByPublicUrl: vi.fn(async () => false),
    };
    svc = new SettingsAdminService(prisma as never, storage as never);
  });

  it('listFaq сериализует даты в ISO', async () => {
    prisma.faqItem.findMany.mockResolvedValue([makeRow({ id: 'a', sortOrder: 0 })]);
    const res = await svc.listFaq();
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.id).toBe('a');
    expect(res.items[0]!.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('replaceFaq обновляет существующие, создаёт новые, удаляет лишние', async () => {
    const updatedA = makeRow({ id: 'a', question: 'Updated', answer: 'Body', sortOrder: 0 });
    const createdC = makeRow({ id: 'c', question: 'New', sortOrder: 1 });

    const tx = {
      faqItem: {
        findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue(updatedA),
        create: vi.fn().mockResolvedValue(createdC),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    const res = await svc.replaceFaq({
      items: [
        { id: 'a', question: 'Updated', answer: 'Body', active: true },
        { question: 'New', answer: 'C', active: true },
      ],
    });

    expect(res.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(tx.faqItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['b'] } },
    });
    expect(tx.faqItem.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: {
        question: 'Updated',
        answer: 'Body',
        active: true,
        sortOrder: 0,
      },
    });
    expect(tx.faqItem.create).toHaveBeenCalledWith({
      data: {
        question: 'New',
        answer: 'C',
        active: true,
        sortOrder: 1,
      },
    });
  });

  it('replaceFaq с пустым списком удаляет все пункты', async () => {
    const tx = {
      faqItem: {
        findMany: vi.fn().mockResolvedValue([{ id: 'a' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    const res = await svc.replaceFaq({ items: [] });
    expect(res.items).toEqual([]);
    expect(tx.faqItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
    });
    expect(tx.faqItem.create).not.toHaveBeenCalled();
  });

  it('replaceFaq игнорирует неизвестный id (создаёт без него)', async () => {
    const created = makeRow({ id: 'new1', question: 'Q', sortOrder: 0 });
    const tx = {
      faqItem: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    const res = await svc.replaceFaq({
      items: [{ id: 'ghost', question: 'Q', answer: 'A' }],
    });
    expect(res.items[0]!.id).toBe('new1');
    expect(tx.faqItem.create).toHaveBeenCalledWith({
      data: {
        question: 'Q',
        answer: 'A',
        active: true,
        sortOrder: 0,
      },
    });
  });

  it('replaceHero обновляет существующие, создаёт новые, удаляет лишние', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const updatedA = {
      id: 'a',
      imageUrl: 'https://x/a.jpg',
      mobileImageUrl: null,
      sortOrder: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const createdC = {
      id: 'c',
      imageUrl: 'https://x/c.jpg',
      mobileImageUrl: 'https://x/c-m.jpg',
      sortOrder: 1,
      active: false,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      heroSlide: {
        findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue(updatedA),
        create: vi.fn().mockResolvedValue(createdC),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    const res = await svc.replaceHero({
      items: [
        { id: 'a', imageUrl: 'https://x/a.jpg', active: true },
        {
          imageUrl: 'https://x/c.jpg',
          mobileImageUrl: 'https://x/c-m.jpg',
          active: false,
        },
      ],
    });

    expect(res.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(tx.heroSlide.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['b'] } },
    });
    expect(tx.heroSlide.update).toHaveBeenCalled();
    expect(tx.heroSlide.create).toHaveBeenCalled();
  });

  it('replaceHero отклоняет слайд без картинки', async () => {
    await expect(
      svc.replaceHero({ items: [{ imageUrl: '   ', active: true }] }),
    ).rejects.toThrow(/картинк/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaceHomepageSets upsert по id и отклоняет дубликат productId', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const product = { id: 'p1', name: 'Set', slug: 'set' };
    const updated = {
      id: 's1',
      imageUrl: 'https://x/s.jpg',
      productId: 'p1',
      sortOrder: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
      product,
    };
    prisma.product = {
      findMany: vi.fn().mockResolvedValue([{ id: 'p1' }]),
    };
    const tx = {
      homepageSet: {
        findMany: vi.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue(updated),
        create: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    const res = await svc.replaceHomepageSets({
      items: [{ id: 's1', imageUrl: 'https://x/s.jpg', productId: 'p1', active: true }],
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.id).toBe('s1');
    expect(tx.homepageSet.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s2'] } },
    });
    expect(tx.homepageSet.create).not.toHaveBeenCalled();

    await expect(
      svc.replaceHomepageSets({
        items: [
          { imageUrl: 'https://x/1.jpg', productId: 'p1' },
          { imageUrl: 'https://x/2.jpg', productId: 'p1' },
        ],
      }),
    ).rejects.toThrow(/двух наборах/i);
  });

  it('replaceHomepageSets отклоняет неполный набор', async () => {
    await expect(
      svc.replaceHomepageSets({
        items: [{ imageUrl: 'https://x/1.jpg', productId: '  ' }],
      }),
    ).rejects.toThrow(/неполн|картинк|товар/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('listQuizContentAdmin отдаёт известные ключи с fallback plain', async () => {
    prisma.quizContentEntry.findMany.mockResolvedValue([
      {
        key: 'greeting',
        plain: 'Custom hello',
        html: '<p>Hi</p>',
        mediaUrl: null,
        mediaType: null,
      },
    ]);

    const res = await svc.listQuizContentAdmin();
    const greeting = res.items.find((i) => i.key === 'greeting');
    const choose = res.items.find((i) => i.key === 'choose_care');
    expect(greeting).toMatchObject({
      key: 'greeting',
      plain: 'Custom hello',
      html: '<p>Hi</p>',
    });
    expect(choose?.plain).toBeTruthy();
    expect(res.items.length).toBeGreaterThan(10);
  });

  it('replaceQuizContent upsert только known keys', async () => {
    const tx = {
      quizContentEntry: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
    prisma.quizContentEntry.findMany.mockResolvedValue([]);

    await svc.replaceQuizContent({
      items: [
        { key: 'greeting', plain: 'A', html: '', mediaUrl: null, mediaType: null },
        { key: 'unknown_key', plain: 'X', html: '', mediaUrl: null, mediaType: null },
      ],
    });

    expect(tx.quizContentEntry.upsert).toHaveBeenCalledTimes(1);
    expect(tx.quizContentEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'greeting' },
        create: expect.objectContaining({ plain: 'A' }),
      }),
    );
  });
});

describe('SettingsPublicService', () => {
  it('listFaq отдаёт только active', async () => {
    const prisma = makePrisma();
    prisma.faqItem.findMany.mockResolvedValue([
      { id: 'a', question: 'Q', answer: 'A' },
    ]);
    const svc = new SettingsPublicService(prisma as never);
    const res = await svc.listFaq();
    expect(prisma.faqItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
    expect(res.items).toEqual([{ id: 'a', question: 'Q', answer: 'A' }]);
  });

  it('getQuizContentPublic мержит DB + fallbacks', async () => {
    const prisma = makePrisma();
    prisma.quizContentEntry.findMany.mockResolvedValue([
      {
        key: 'greeting',
        plain: 'From DB',
        html: '',
        mediaUrl: null,
        mediaType: null,
      },
    ]);
    const svc = new SettingsPublicService(prisma as never);
    const res = await svc.getQuizContentPublic();
    expect(res.content.greeting.plain).toBe('From DB');
    expect(res.content.choose_care.plain).toBeTruthy();
    expect(res.content.file_1.plain).toBe('');
  });
});
