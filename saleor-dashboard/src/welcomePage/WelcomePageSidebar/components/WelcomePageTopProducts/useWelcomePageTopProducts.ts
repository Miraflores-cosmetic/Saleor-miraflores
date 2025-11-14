import useAppChannel from "@dashboard/components/AppLayout/AppChannelContext";
import { ReportingPeriod, useTopProductSalesQuery } from "@dashboard/graphql";

export const useWelcomePageTopProducts = (period: ReportingPeriod = ReportingPeriod.TODAY) => {
  const { channel } = useAppChannel();

  const { data, loading, error } = useTopProductSalesQuery({
    variables: {
      period,
      channel: channel?.slug || "",
    },
    skip: !channel,
  });

  const topProducts = data?.reportProductSales?.edges || [];

  return {
    topProducts,
    loading,
    hasError: !!error,
  };
};

