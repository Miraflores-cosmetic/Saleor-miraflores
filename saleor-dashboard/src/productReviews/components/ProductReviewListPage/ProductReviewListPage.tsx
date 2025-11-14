import { TopNav } from "@dashboard/components/AppLayout/TopNav";
import { DashboardCard } from "@dashboard/components/Card";
import { ListPageLayout } from "@dashboard/components/Layouts";
import { sectionNames } from "@dashboard/intl";
import { Box } from "@saleor/macaw-ui-next";
import { FormattedMessage, useIntl } from "react-intl";

import { ProductReviewListDatagrid } from "../ProductReviewListDatagrid/ProductReviewListDatagrid";
import { ProductReviewFragment } from "./types";

interface ProductReviewListPageProps {
  reviews: ProductReviewFragment[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReviewClick: (id: string) => void;
}

export const ProductReviewListPage = ({
  reviews,
  loading,
  onApprove,
  onReject,
  onReviewClick,
}: ProductReviewListPageProps) => {
  const intl = useIntl();

  return (
    <ListPageLayout>
      <TopNav
        title={intl.formatMessage({
          id: "productReviews.title",
          defaultMessage: "Отзывы на модерацию",
        })}
        isAlignToRight={false}
        withoutBorder
      />
      <DashboardCard>
        <ProductReviewListDatagrid
          reviews={reviews}
          loading={loading}
          onApprove={onApprove}
          onReject={onReject}
          onReviewClick={onReviewClick}
        />
      </DashboardCard>
    </ListPageLayout>
  );
};

