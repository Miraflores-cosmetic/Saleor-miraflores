import { BadRequestException, Injectable } from '@nestjs/common';
import { CatalogProductsAdminService } from '../catalog/catalog-products.admin.service';
import { DashboardAdminService } from '../dashboard/dashboard-admin.service';
import { OrdersAdminService } from '../orders/orders-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { staffCanUseAssistantTool, contentGapScopesForStaff } from './assistant-tool-acl';
import type { GptToolDef } from './gptunnel.client';

export type AssistantToolAcl = {
  sections: readonly string[];
  isSuperAdmin: boolean;
};

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  const [user, domain] = email.trim().split('@');
  if (!domain) return '***';
  const u = user.length <= 2 ? `${user[0] ?? '*'}*` : `${user.slice(0, 2)}***`;
  return `${u}@${domain}`;
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

function periodArgs(args: Record<string, unknown>): {
  period: string;
  from?: string;
  to?: string;
} {
  const period =
    typeof args.period === 'string' && args.period.trim()
      ? args.period.trim()
      : 'today';
  const from = typeof args.from === 'string' ? args.from : undefined;
  const to = typeof args.to === 'string' ? args.to : undefined;
  return { period, from, to };
}

const PERIOD_ENUM = [
  'today',
  'yesterday',
  'last_7',
  'week',
  'month',
  'custom',
] as const;

const PERIOD_PROPS = {
  period: {
    type: 'string',
    enum: [...PERIOD_ENUM],
    description:
      'today | yesterday | last_7 | week (пн–сегодня) | month | custom. По умолчанию today',
  },
  from: { type: 'string', description: 'YYYY-MM-DD для custom' },
  to: { type: 'string', description: 'YYYY-MM-DD для custom' },
} as const;

@Injectable()
export class AssistantToolsService {
  constructor(
    private readonly dashboard: DashboardAdminService,
    private readonly orders: OrdersAdminService,
    private readonly catalog: CatalogProductsAdminService,
    private readonly prisma: PrismaService,
  ) {}

  /** OpenAI-compatible tool schemas (read-only). Filtered by staff sections when acl given. */
  listToolDefs(acl?: AssistantToolAcl): GptToolDef[] {
    const defs: GptToolDef[] = [
      {
        type: 'function',
        function: {
          name: 'get_dashboard_overview',
          description:
            'KPI дашборда: заказы, выручка, средний чек, новые клиенты, топ товаров. Период: today | yesterday | last_7 | week | month | custom (from/to YYYY-MM-DD, Москва). Для сравнения двух периодов используй compare_periods.',
          parameters: {
            type: 'object',
            properties: { ...PERIOD_PROPS },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_orders',
          description:
            'Список заказов админки (чтение). Фильтры: q (номер/email/телефон/имя), status, page, limit (до 50). Персональные данные маскируются.',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Поиск по номеру / контактам' },
              status: {
                type: 'string',
                description: 'Статус заказа, если известен (как в админке)',
              },
              page: { type: 'integer', description: 'Страница, с 1' },
              limit: { type: 'integer', description: 'Размер страницы, 1–50' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_products',
          description:
            'Поиск товаров каталога: имя / SKU. visibility: all | catalog | hidden. Возвращает stockTotal, цену, ссылку в админку.',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Строка поиска' },
              visibility: {
                type: 'string',
                enum: ['all', 'catalog', 'hidden'],
                description: 'По умолчанию all',
              },
              page: { type: 'integer' },
              limit: { type: 'integer', description: '1–50' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_oos_variants',
          description:
            'Варианты с нулевым или отрицательным доступным стоком (stock − reserve ≤ 0), только active товар/вариант. Для вопросов про out-of-stock / нет в наличии.',
          parameters: {
            type: 'object',
            properties: {
              limit: {
                type: 'integer',
                description: 'Сколько позиций вернуть, 1–100, по умолчанию 30',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'sales_timeseries',
          description:
            'Динамика продаж по дням (Москва). По умолчанию detail=summary: итоги + sparkline + best/worst + top deltas (без полного series). detail=full — все точки. Период до 90 дней.',
          parameters: {
            type: 'object',
            properties: {
              ...PERIOD_PROPS,
              detail: {
                type: 'string',
                enum: ['summary', 'full'],
                description: 'По умолчанию summary',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'compare_periods',
          description:
            'Сравнить два периода одним вызовом: KPI a vs b и delta (a−b, %). Для «сравни сегодня с месяцем» — periodA=today, periodB=month. Не вызывай два overview подряд.',
          parameters: {
            type: 'object',
            properties: {
              periodA: {
                type: 'string',
                enum: [...PERIOD_ENUM],
                description: 'По умолчанию today',
              },
              fromA: { type: 'string' },
              toA: { type: 'string' },
              periodB: {
                type: 'string',
                enum: [...PERIOD_ENUM],
                description: 'По умолчанию month',
              },
              fromB: { type: 'string' },
              toB: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'top_products',
          description:
            'Топ товаров/SKU за период: sortBy qty (шт.) или revenue (выручка строки). limit до 30.',
          parameters: {
            type: 'object',
            properties: {
              ...PERIOD_PROPS,
              sortBy: {
                type: 'string',
                enum: ['qty', 'revenue'],
                description: 'По умолчанию qty',
              },
              limit: { type: 'integer', description: '1–30, по умолчанию 10' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'funnel_lite',
          description:
            'Воронка заказов по статусам за период (все статусы): NEW, AWAITING_PAYMENT, PAID, PACKING, SHIPPED, DELIVERED, CANCELLED, REFUNDED. Доли, cancelRate, paidRate.',
          parameters: {
            type: 'object',
            properties: { ...PERIOD_PROPS },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'content_gaps',
          description:
            'Пробелы контента (summary + до 8 highlights). Области режутся по ACL staff: settings→FAQ/страницы/hero, blog→посты. Без полных массивов.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
    ];
    if (!acl) return defs;
    return defs.filter((d) =>
      staffCanUseAssistantTool(d.function.name, acl.sections, acl.isSuperAdmin),
    );
  }

  async execute(
    name: string,
    argsJson: string,
    acl?: AssistantToolAcl,
  ): Promise<unknown> {
    if (
      acl &&
      !staffCanUseAssistantTool(name, acl.sections, acl.isSuperAdmin)
    ) {
      return { error: 'Нет доступа к этому инструменту' };
    }

    let args: Record<string, unknown> = {};
    try {
      args = argsJson?.trim() ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
    } catch {
      return { error: 'Некорректный JSON аргументов tool' };
    }

    try {
      return await this.executeKnown(name, args, acl);
    } catch (e) {
      if (e instanceof BadRequestException) {
        const res = e.getResponse();
        const msg =
          typeof res === 'string'
            ? res
            : Array.isArray((res as { message?: unknown }).message)
              ? ((res as { message: string[] }).message).join('; ')
              : String(
                  (res as { message?: unknown }).message ??
                    (e instanceof Error ? e.message : 'Некорректный запрос'),
                );
        return { error: msg };
      }
      throw e;
    }
  }

  private async executeKnown(
    name: string,
    args: Record<string, unknown>,
    acl?: AssistantToolAcl,
  ): Promise<unknown> {
    if (name === 'get_dashboard_overview') {
      const overview = await this.dashboard.getOverview(periodArgs(args));
      return {
        ...overview,
        adminLinks: {
          dashboard: '/admin',
          orders: '/admin/orders',
        },
      };
    }

    if (name === 'list_orders') {
      const page = clampInt(args.page, 1, 1, 100);
      const limit = clampInt(args.limit, 20, 1, 50);
      const q = typeof args.q === 'string' ? args.q : undefined;
      const status = typeof args.status === 'string' ? args.status : undefined;
      const result = await this.orders.list({ q, status, page, limit });
      return {
        total: result.total,
        page: result.page,
        limit: result.limit,
        adminLink: '/admin/orders',
        items: result.items.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          total: o.total,
          refundedAmount: o.refundedAmount,
          createdAt: o.createdAt,
          email: maskEmail(o.email),
          phone: maskPhone(o.phone),
          customerName: o.customerName
            ? `${o.customerName.trim().slice(0, 1)}***`
            : null,
          adminLink: `/admin/orders/${o.id}`,
        })),
      };
    }

    if (name === 'search_products') {
      const page = clampInt(args.page, 1, 1, 100);
      const limit = clampInt(args.limit, 20, 1, 50);
      const q = typeof args.q === 'string' ? args.q : undefined;
      const visibilityRaw =
        typeof args.visibility === 'string' ? args.visibility.trim() : 'all';
      const visibility =
        visibilityRaw === 'catalog' || visibilityRaw === 'hidden'
          ? visibilityRaw
          : 'all';
      const result = await this.catalog.listProducts({
        q,
        page,
        limit,
        visibility,
      });
      return {
        total: result.total,
        page: result.page,
        limit: result.limit,
        adminLink: '/admin/catalog/products',
        items: result.items.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          active: p.active,
          primarySku: p.primarySku,
          minPrice: p.minPrice,
          stockTotal: p.stockTotal,
          category: p.category?.name ?? null,
          adminLink: `/admin/catalog/products/${p.id}`,
        })),
      };
    }

    if (name === 'list_oos_variants') {
      const limit = clampInt(args.limit, 30, 1, 100);
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          sku: string;
          name: string;
          stock: number;
          stockReserve: number;
          productId: string;
          productName: string;
          productSlug: string;
        }>
      >`
        SELECT
          v.id,
          v.sku,
          v.name,
          v.stock,
          v."stockReserve",
          p.id AS "productId",
          p.name AS "productName",
          p.slug AS "productSlug"
        FROM "ProductVariant" v
        INNER JOIN "Product" p ON p.id = v."productId"
        WHERE v.active = true
          AND p.active = true
          AND (v.stock - v."stockReserve") <= 0
        ORDER BY v."updatedAt" DESC
        LIMIT ${limit}
      `;
      const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "ProductVariant" v
        INNER JOIN "Product" p ON p.id = v."productId"
        WHERE v.active = true
          AND p.active = true
          AND (v.stock - v."stockReserve") <= 0
      `;
      const total = Number(countRows[0]?.count ?? 0);
      return {
        total,
        limit,
        adminLink: '/admin/catalog/products',
        items: rows.map((r) => ({
          variantId: r.id,
          sku: r.sku,
          variantName: r.name,
          stock: r.stock,
          stockReserve: r.stockReserve,
          available: Math.max(0, r.stock - r.stockReserve),
          productId: r.productId,
          productName: r.productName,
          productSlug: r.productSlug,
          adminLink: `/admin/catalog/products/${r.productId}`,
        })),
      };
    }

    if (name === 'sales_timeseries') {
      const detail =
        typeof args.detail === 'string' && args.detail === 'full'
          ? 'full'
          : 'summary';
      return this.dashboard.getSalesTimeseries({
        ...periodArgs(args),
        detail,
      });
    }

    if (name === 'compare_periods') {
      const periodA =
        typeof args.periodA === 'string' && args.periodA.trim()
          ? args.periodA.trim()
          : 'today';
      const periodB =
        typeof args.periodB === 'string' && args.periodB.trim()
          ? args.periodB.trim()
          : 'month';
      return this.dashboard.comparePeriods({
        periodA,
        fromA: typeof args.fromA === 'string' ? args.fromA : undefined,
        toA: typeof args.toA === 'string' ? args.toA : undefined,
        periodB,
        fromB: typeof args.fromB === 'string' ? args.fromB : undefined,
        toB: typeof args.toB === 'string' ? args.toB : undefined,
      });
    }

    if (name === 'top_products') {
      const sortBy =
        typeof args.sortBy === 'string' && args.sortBy === 'revenue'
          ? 'revenue'
          : 'qty';
      const limit = clampInt(args.limit, 10, 1, 30);
      return this.dashboard.getTopProducts({
        ...periodArgs(args),
        sortBy,
        limit,
      });
    }

    if (name === 'funnel_lite') {
      return this.dashboard.getFunnelLite(periodArgs(args));
    }

    if (name === 'content_gaps') {
      const scopes = acl
        ? contentGapScopesForStaff(acl.sections, acl.isSuperAdmin)
        : undefined;
      if (scopes && scopes.length === 0) {
        return { error: 'Нет доступа к разделам контента' };
      }
      return this.dashboard.getContentGaps({ scopes });
    }

    return { error: `Неизвестный tool: ${name}` };
  }
}
