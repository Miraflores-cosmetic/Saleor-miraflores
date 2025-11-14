import useAppChannel from "@dashboard/components/AppLayout/AppChannelContext";
import { useAbandonedCheckoutsQuery } from "@dashboard/graphql";

export const useWelcomePageAbandonedCheckouts = (hoursThreshold: number = 24) => {
  const { channel } = useAppChannel();

  const { data, loading, error } = useAbandonedCheckoutsQuery({
    variables: {
      channel: channel?.slug || "",
    },
    skip: !channel,
  });

  // Фильтруем брошенные корзины (неактивные X часов, с товарами, с контактом)
  const now = new Date();
  const thresholdDate = new Date(now.getTime() - hoursThreshold * 60 * 60 * 1000);

  const abandonedCheckouts = data?.checkouts?.edges?.filter(({ node }) => {
    const lastChange = new Date(node.lastChange);
    const hasContact = node.email || node.user;
    const hasItems = node.lines && node.lines.length > 0;
    const isAbandoned = lastChange < thresholdDate;

    return hasContact && hasItems && isAbandoned;
  }) || [];

  // Подсчёт потенциальной выручки
  const potentialRevenue = abandonedCheckouts.reduce((sum, { node }) => {
    return sum + (node.totalPrice?.gross?.amount || 0);
  }, 0);

  const count = abandonedCheckouts.length;

  return {
    count,
    potentialRevenue,
    currency: channel?.currencyCode || "RUB",
    loading,
    hasError: !!error,
    checkouts: abandonedCheckouts.slice(0, 5), // Топ 5 для отображения
  };
};

