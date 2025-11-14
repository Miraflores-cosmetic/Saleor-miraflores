import { DashboardCard } from "@dashboard/components/Card";
import Money from "@dashboard/components/Money";
import { ReportingPeriod } from "@dashboard/graphql";
import { Box, Button, Skeleton, Text } from "@saleor/macaw-ui-next";
import { useState } from "react";

import { useWelcomePageComplexStats } from "./useWelcomePageComplexStats";

const PERIOD_LABELS = {
  [ReportingPeriod.TODAY]: "Сегодня",
  [ReportingPeriod.THIS_MONTH]: "Этот месяц",
};

export const WelcomePageComplexStats = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportingPeriod>(ReportingPeriod.TODAY);
  const { 
    totalRevenue, 
    ordersCount, 
    averageOrderValue, 
    newCustomersCount,
    checkoutsCount,
    conversionRate,
    currency, 
    loading, 
    hasError 
  } = useWelcomePageComplexStats(selectedPeriod);

  if (loading) {
    return (
      <DashboardCard borderRadius={3} borderWidth={1} borderStyle="solid" borderColor="default1">
        <DashboardCard.Header>
          <DashboardCard.Title>
            <Skeleton width={10} height={2} />
          </DashboardCard.Title>
        </DashboardCard.Header>
        <DashboardCard.Content>
          <Skeleton width={8} height={3} />
        </DashboardCard.Content>
      </DashboardCard>
    );
  }

  if (hasError) {
    return null;
  }

  return (
    <DashboardCard borderRadius={3} borderWidth={1} borderStyle="solid" borderColor="default1">
      <DashboardCard.Header>
        <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
          <DashboardCard.Title>
            <Text size={6} fontWeight="bold">
              📊 Сводка
            </Text>
          </DashboardCard.Title>
          
          <Box display="flex" gap={2}>
            {Object.entries(PERIOD_LABELS).map(([period, label]) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? "primary" : "secondary"}
                size="small"
                onClick={() => setSelectedPeriod(period as ReportingPeriod)}
              >
                {label}
              </Button>
            ))}
          </Box>
        </Box>
      </DashboardCard.Header>
      
      <DashboardCard.Content>
        <Box display="grid" __gridTemplateColumns="repeat(2, 1fr)" gap={4}>
          {/* Заказы и выручка */}
          <Box
            padding={3}
            borderRadius={2}
            backgroundColor="default2"
            display="flex"
            flexDirection="column"
            gap={1}
          >
            <Text size={2} color="default2">
              Заказов
            </Text>
            <Text size={5} fontWeight="bold">
              {ordersCount}
            </Text>
          </Box>

          <Box
            padding={3}
            borderRadius={2}
            backgroundColor="default2"
            display="flex"
            flexDirection="column"
            gap={1}
          >
            <Text size={2} color="default2">
              Выручка
            </Text>
            <Text size={5} fontWeight="bold">
              <Money
                money={{
                  amount: totalRevenue,
                  currency: currency,
                }}
              />
            </Text>
          </Box>

          {/* Средний чек */}
          <Box
            padding={3}
            borderRadius={2}
            backgroundColor="default2"
            display="flex"
            flexDirection="column"
            gap={1}
          >
            <Text size={2} color="default2">
              Средний чек
            </Text>
            <Text size={5} fontWeight="bold">
              <Money
                money={{
                  amount: averageOrderValue,
                  currency: currency,
                }}
              />
            </Text>
          </Box>

          {/* Новые клиенты */}
          <Box
            padding={3}
            borderRadius={2}
            backgroundColor="default2"
            display="flex"
            flexDirection="column"
            gap={1}
          >
            <Text size={2} color="default2">
              Новых клиентов
            </Text>
            <Text size={5} fontWeight="bold">
              {newCustomersCount}
            </Text>
          </Box>

          {/* Конверсия корзины → заказ */}
          <Box
            padding={3}
            borderRadius={2}
            backgroundColor="default2"
            display="flex"
            flexDirection="column"
            gap={1}
            __gridColumn="1 / -1"
          >
            <Text size={2} color="default2">
              Конверсия корзины → заказ
            </Text>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Text size={5} fontWeight="bold">
                {checkoutsCount > 0 ? conversionRate.toFixed(1) : "0.0"}%
              </Text>
              <Text size={2} color="default2">
                ({ordersCount} заказов / {checkoutsCount} корзин)
              </Text>
            </Box>
          </Box>
        </Box>
      </DashboardCard.Content>
    </DashboardCard>
  );
};

