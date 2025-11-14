import { DashboardCard } from "@dashboard/components/Card";
import Money from "@dashboard/components/Money";
import { ReportingPeriod } from "@dashboard/graphql";
import { Box, Button, Skeleton, Text } from "@saleor/macaw-ui-next";
import { useState } from "react";

import { useWelcomePageTopProducts } from "./useWelcomePageTopProducts";

const PERIOD_LABELS = {
  [ReportingPeriod.TODAY]: "Сегодня",
  [ReportingPeriod.THIS_MONTH]: "Этот месяц",
};

export const WelcomePageTopProducts = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportingPeriod>(ReportingPeriod.TODAY);
  const { topProducts, loading, hasError } = useWelcomePageTopProducts(selectedPeriod);

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
              🏆 Топ продаж
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
        <Box display="flex" flexDirection="column" gap={3}>
          {topProducts.length > 0 ? (
            topProducts.map(({ node }, index) => {
              const productName = node.product?.name || node.name || "Неизвестный товар";
              const quantity = node.quantityOrdered || 0;
              const revenue = node.revenue?.gross;

              return (
                <Box
                  key={node.id || index}
                  padding={3}
                  borderRadius={2}
                  backgroundColor="default2"
                  display="flex"
                  flexDirection="column"
                  gap={1}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Text size={3} fontWeight="medium">
                      {index + 1}. {productName.length > 30 ? productName.substring(0, 27) + "..." : productName}
                    </Text>
                  </Box>
                  
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Text size={2} color="default2">
                      Продано: {quantity} шт
                    </Text>
                    {revenue && (
                      <Text size={2} fontWeight="medium">
                        <Money money={revenue} />
                      </Text>
                    )}
                  </Box>
                  
                  {node.sku && (
                    <Text size={2} color="default2">
                      SKU: {node.sku}
                    </Text>
                  )}
                </Box>
              );
            })
          ) : (
            <Box
              padding={4}
              borderRadius={2}
              backgroundColor="default2"
              display="flex"
              justifyContent="center"
            >
              <Text size={3} color="default2">
                Нет продаж сегодня
              </Text>
            </Box>
          )}
        </Box>
      </DashboardCard.Content>
    </DashboardCard>
  );
};

