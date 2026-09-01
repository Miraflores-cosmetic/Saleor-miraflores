import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AssistantToolsService } from './assistant-tools.service';

describe('AssistantToolsService', () => {
  const dashboard = {
    getOverview: vi.fn(),
    getSalesTimeseries: vi.fn(),
    comparePeriods: vi.fn(),
    getTopProducts: vi.fn(),
    getFunnelLite: vi.fn(),
    getContentGaps: vi.fn(),
  };
  const orders = { list: vi.fn() };
  const catalog = { listProducts: vi.fn() };
  const prisma = { $queryRaw: vi.fn() };
  let svc: AssistantToolsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AssistantToolsService(
      dashboard as never,
      orders as never,
      catalog as never,
      prisma as never,
    );
  });

  it('listToolDefs включает фазу 1 и 2', () => {
    const names = svc.listToolDefs().map((t) => t.function.name);
    expect(names).toEqual([
      'get_dashboard_overview',
      'list_orders',
      'search_products',
      'list_oos_variants',
      'sales_timeseries',
      'compare_periods',
      'top_products',
      'funnel_lite',
      'content_gaps',
    ]);
  });

  it('execute неизвестного tool возвращает error', async () => {
    await expect(svc.execute('nope', '{}')).resolves.toEqual({
      error: 'Неизвестный tool: nope',
    });
  });

  it('list_orders маскирует email/телефон', async () => {
    orders.list.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'o1',
          number: 42,
          status: 'PAID',
          total: 1000,
          refundedAmount: 0,
          createdAt: new Date('2026-01-01'),
          email: 'ivan@example.com',
          phone: '+79001234567',
          customerName: 'Иван',
        },
      ],
    });

    const res = (await svc.execute('list_orders', '{"limit":5}')) as {
      items: Array<{ email: string | null; phone: string | null; customerName: string | null }>;
    };

    expect(orders.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
    expect(res.items[0].email).toBe('iv***@example.com');
    expect(res.items[0].phone).toBe('***4567');
    expect(res.items[0].customerName).toBe('И***');
  });

  it('sales_timeseries / compare_periods / top / funnel / content_gaps делегируют', async () => {
    dashboard.getSalesTimeseries.mockResolvedValue({ detail: 'summary' });
    dashboard.comparePeriods.mockResolvedValue({ delta: {} });
    dashboard.getTopProducts.mockResolvedValue({ items: [] });
    dashboard.getFunnelLite.mockResolvedValue({ totalOrders: 0 });
    dashboard.getContentGaps.mockResolvedValue({ summary: {} });

    await svc.execute('sales_timeseries', '{"period":"month"}');
    await svc.execute(
      'compare_periods',
      '{"periodA":"today","periodB":"month"}',
    );
    await svc.execute('top_products', '{"period":"today","sortBy":"revenue"}');
    await svc.execute('funnel_lite', '{"period":"month"}');
    await svc.execute('content_gaps', '{}', {
      sections: ['blog'],
      isSuperAdmin: false,
    });

    expect(dashboard.getSalesTimeseries).toHaveBeenCalledWith({
      period: 'month',
      from: undefined,
      to: undefined,
      detail: 'summary',
    });
    expect(dashboard.comparePeriods).toHaveBeenCalledWith({
      periodA: 'today',
      fromA: undefined,
      toA: undefined,
      periodB: 'month',
      fromB: undefined,
      toB: undefined,
    });
    expect(dashboard.getTopProducts).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'today', sortBy: 'revenue', limit: 10 }),
    );
    expect(dashboard.getFunnelLite).toHaveBeenCalled();
    expect(dashboard.getContentGaps).toHaveBeenCalledWith({
      scopes: ['blog'],
    });
  });

  it('listToolDefs фильтрует по ACL', () => {
    const names = svc
      .listToolDefs({ sections: ['dashboard', 'catalog'], isSuperAdmin: false })
      .map((t) => t.function.name);
    expect(names).toEqual([
      'get_dashboard_overview',
      'search_products',
      'list_oos_variants',
      'sales_timeseries',
      'compare_periods',
      'top_products',
    ]);
  });

  it('execute отказывает без ACL на tool', async () => {
    await expect(
      svc.execute('list_orders', '{}', {
        sections: ['dashboard', 'assistant'],
        isSuperAdmin: false,
      }),
    ).resolves.toEqual({ error: 'Нет доступа к этому инструменту' });
    expect(orders.list).not.toHaveBeenCalled();
  });
});
