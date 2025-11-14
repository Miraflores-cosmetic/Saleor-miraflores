import { DashboardCard } from "@dashboard/components/Card";
import Money from "@dashboard/components/Money";
import { Box, Button, Skeleton, Text } from "@saleor/macaw-ui-next";
import { useState } from "react";
import { useIntl } from "react-intl";

import { useWelcomePageAbandonedCheckouts } from "./useWelcomePageAbandonedCheckouts";

const PERIOD_OPTIONS = [
  { value: 24, label: "24ч" },
  { value: 72, label: "3д" },
  { value: 168, label: "7д" },
  { value: 720, label: "30д" },
];

export const WelcomePageAbandonedCheckouts = () => {
  const intl = useIntl();
  const [hoursThreshold, setHoursThreshold] = useState(24);
  const { count, potentialRevenue, currency, loading, hasError, checkouts } =
    useWelcomePageAbandonedCheckouts(hoursThreshold);

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
              🛒 Брошенные корзины
            </Text>
          </DashboardCard.Title>
          
          <Box display="flex" gap={2}>
            {PERIOD_OPTIONS.map(({ value, label }) => (
              <Button
                key={value}
                variant={hoursThreshold === value ? "primary" : "secondary"}
                size="small"
                onClick={() => setHoursThreshold(value)}
              >
                {label}
              </Button>
            ))}
          </Box>
        </Box>
      </DashboardCard.Header>
      <DashboardCard.Content>
        <Box display="flex" flexDirection="column" gap={4}>
          {/* Общая статистика */}
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Text size={4} color="default2">
              Количество:
            </Text>
            <Text size={5} fontWeight="medium">
              {count}
            </Text>
          </Box>

          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Text size={4} color="default2">
              Потенциальная выручка:
            </Text>
            <Text size={5} fontWeight="medium">
              <Money
                money={{
                  amount: potentialRevenue,
                  currency: currency,
                }}
              />
            </Text>
          </Box>

          {/* Список топ корзин */}
          {count > 0 && (
            <Box marginTop={3}>
              <Text size={4} fontWeight="medium" marginBottom={2}>
                Топ корзин:
              </Text>
              <Box display="flex" flexDirection="column" gap={2}>
                {checkouts.map(({ node }) => {
                  const email = node.email || node.user?.email || "Нет email";
                  const total = node.totalPrice?.gross?.amount || 0;
                  const itemsCount = node.lines?.length || 0;
                  const lastChange = new Date(node.lastChange);
                  const hoursAgo = Math.floor(
                    (new Date().getTime() - lastChange.getTime()) / (1000 * 60 * 60)
                  );
                  const daysAgo = Math.floor(hoursAgo / 24);

                  return (
                    <Box
                      key={node.id}
                      padding={3}
                      borderRadius={2}
                      backgroundColor="default2"
                      display="flex"
                      flexDirection="column"
                      gap={1}
                    >
                      <Text size={3} fontWeight="medium">
                        {email.length > 30 ? email.substring(0, 27) + "..." : email}
                      </Text>
                      <Box display="flex" justifyContent="space-between">
                        <Text size={2} color="default2">
                          {itemsCount} {itemsCount === 1 ? "товар" : "товаров"}
                        </Text>
                        <Text size={2} fontWeight="medium">
                          {total.toFixed(2)} {currency}
                        </Text>
                      </Box>
                      <Text size={2} color="default2">
                        {daysAgo > 0
                          ? `${daysAgo}д ${hoursAgo % 24}ч назад`
                          : `${hoursAgo}ч назад`}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {count === 0 && (
            <Box
              padding={4}
              borderRadius={2}
              backgroundColor="default2"
              display="flex"
              justifyContent="center"
            >
              <Text size={3} color="default2">
                ✅ Нет брошенных корзин
              </Text>
            </Box>
          )}
        </Box>
      </DashboardCard.Content>
    </DashboardCard>
  );
};

