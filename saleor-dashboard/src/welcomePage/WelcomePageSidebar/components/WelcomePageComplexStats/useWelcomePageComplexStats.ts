import useAppChannel from "@dashboard/components/AppLayout/AppChannelContext";
import { ReportingPeriod, useComplexDashboardStatsQuery } from "@dashboard/graphql";

export const useWelcomePageComplexStats = (period: ReportingPeriod = ReportingPeriod.TODAY) => {
  const { channel } = useAppChannel();

  const { data, loading, error } = useComplexDashboardStatsQuery({
    variables: {
      period,
      channel: channel?.slug || "",
    },
    skip: !channel,
  });

  // Общая выручка
  const totalRevenue = data?.ordersTotal?.gross?.amount || 0;
  const currency = data?.ordersTotal?.gross?.currency || channel?.currencyCode || "RUB";

  // Фильтруем заказы по периоду
  const now = new Date();
  const periodStart = period === ReportingPeriod.TODAY 
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(now.getFullYear(), now.getMonth(), 1);

  const ordersInPeriod = data?.orders?.edges?.filter(({ node }) => {
    const orderDate = new Date(node.created);
    return orderDate >= periodStart;
  }) || [];

  const ordersCount = ordersInPeriod.length;

  // Средний чек
  const averageOrderValue = ordersCount > 0 ? totalRevenue / ordersCount : 0;

  // Новые клиенты за период
  const newCustomers = data?.customers?.edges?.filter(({ node }) => {
    const joinDate = new Date(node.dateJoined);
    return joinDate >= periodStart;
  }) || [];

  const newCustomersCount = newCustomers.length;

  // Корзины за период (с товарами)
  const checkoutsInPeriod = data?.checkouts?.edges?.filter(({ node }) => {
    const checkoutDate = new Date(node.created);
    const hasItems = node.lines && node.lines.length > 0;
    return checkoutDate >= periodStart && hasItems;
  }) || [];

  const checkoutsCount = checkoutsInPeriod.length;

  // Конверсия корзины → заказ (стандартная e-commerce метрика)
  // Формула: (Заказы / Корзины с товарами) × 100%
  const conversionRate = checkoutsCount > 0 
    ? (ordersCount / checkoutsCount) * 100 
    : 0;

  return {
    totalRevenue,
    ordersCount,
    averageOrderValue,
    newCustomersCount,
    checkoutsCount,
    conversionRate,
    currency,
    loading,
    hasError: !!error,
  };
};

