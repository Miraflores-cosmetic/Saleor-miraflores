import useNotifier from "@dashboard/hooks/useNotifier";
import { commonMessages } from "@dashboard/intl";
import { FormattedMessage } from "react-intl";

import {
  useProductReviewModerateMutation,
  useProductReviewsPublishedQuery,
} from "@dashboard/graphql";
import { ProductReviewPublishedPage } from "../components/ProductReviewPublishedPage";
import { ProductReviewDetailDialog } from "../components/ProductReviewDetailDialog";
import { useState } from "react";

export const ProductReviewPublished = () => {
  const notify = useNotifier();
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useProductReviewsPublishedQuery({
    displayLoader: true,
    errorPolicy: "all",
    onError: error => {
      console.error("Error loading published product reviews:", error);
    },
  });

  const reviews = Array.isArray(data?.productReviewsPublished)
    ? data.productReviewsPublished
    : [];

  const [moderateReview, moderateReviewOpts] = useProductReviewModerateMutation({
    onCompleted: data => {
      const errors = data?.productReviewModerate?.errors;
      if (!errors || errors.length === 0) {
        notify({
          status: "success",
          text: <FormattedMessage {...commonMessages.savedChanges} />,
        });
        refetch();
      } else {
        notify({
          status: "error",
          text: errors[0].message || "Ошибка при модерации отзыва",
        });
      }
    },
  });

  const handleReject = (id: string) => {
    moderateReview({
      variables: {
        input: {
          id,
          action: "reject",
        },
      },
    });
  };

  const handleReviewClick = (id: string) => {
    setSelectedReviewId(id);
  };

  const selectedReview = reviews.find(r => r.id === selectedReviewId) || null;

  const handleCloseDialog = () => {
    setSelectedReviewId(null);
  };

  // Для опубликованных отзывов можно только просматривать, но не одобрять
  const handleApprove = () => {
    // Опубликованные отзывы уже одобрены
  };

  return (
    <>
      <ProductReviewPublishedPage
        reviews={reviews}
        loading={loading || moderateReviewOpts.loading}
        onApprove={handleApprove}
        onReject={handleReject}
        onReviewClick={handleReviewClick}
      />
      <ProductReviewDetailDialog
        open={!!selectedReview}
        onClose={handleCloseDialog}
        review={selectedReview}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </>
  );
};

