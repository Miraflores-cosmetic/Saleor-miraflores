import { TopNav } from "@dashboard/components/AppLayout/TopNav";
import { DashboardCard } from "@dashboard/components/Card";
import { ListPageLayout } from "@dashboard/components/Layouts";
import { useIntl } from "react-intl";

import { ProductReviewListDatagrid } from "../ProductReviewListDatagrid/ProductReviewListDatagrid";
import { ProductReviewFragment } from "../ProductReviewListPage/types";

interface ProductReviewPublishedPageProps {
  reviews: ProductReviewFragment[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReviewClick: (id: string) => void;
}

export const ProductReviewPublishedPage = ({
  reviews,
  loading,
  onApprove,
  onReject,
  onReviewClick,
}: ProductReviewPublishedPageProps) => {
  const intl = useIntl();

  return (
    <ListPageLayout>
      <TopNav
        title={intl.formatMessage({
          id: "productReviews.published.title",
          defaultMessage: "Опубликованные отзывы",
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

