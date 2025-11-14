import Datagrid from "@dashboard/components/Datagrid/Datagrid";
import {
  DatagridChangeStateContext,
  useDatagridChangeState,
} from "@dashboard/components/Datagrid/hooks/useDatagridChange";
import { readonlyTextCell } from "@dashboard/components/Datagrid/customCells/cells";
import { AvailableColumn } from "@dashboard/components/Datagrid/types";
import { GridCell, Item } from "@glideapps/glide-data-grid";
import { Box } from "@saleor/macaw-ui-next";
import { useMemo, useCallback } from "react";
import { useIntl } from "react-intl";

import { ProductReviewFragment } from "../ProductReviewListPage/types";

interface ProductReviewListDatagridProps {
  reviews: ProductReviewFragment[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReviewClick: (id: string) => void;
}

const productReviewColumns = (intl: any): AvailableColumn[] => [
  {
    id: "product",
    title: intl.formatMessage({
      id: "productReview.column.product",
      defaultMessage: "Товар",
    }),
    width: 250,
  },
  {
    id: "user",
    title: intl.formatMessage({
      id: "productReview.column.user",
      defaultMessage: "Пользователь",
    }),
    width: 200,
  },
  {
    id: "rating",
    title: intl.formatMessage({
      id: "productReview.column.rating",
      defaultMessage: "Рейтинг",
    }),
    width: 120,
  },
  {
    id: "text",
    title: intl.formatMessage({
      id: "productReview.column.text",
      defaultMessage: "Текст",
    }),
    width: 400,
  },
  {
    id: "images",
    title: intl.formatMessage({
      id: "productReview.column.images",
      defaultMessage: "Изображения",
    }),
    width: 150,
  },
  {
    id: "createdAt",
    title: intl.formatMessage({
      id: "productReview.column.createdAt",
      defaultMessage: "Дата создания",
    }),
    width: 180,
  },
  {
    id: "actions",
    title: intl.formatMessage({
      id: "productReview.column.actions",
      defaultMessage: "Действия",
    }),
    width: 200,
  },
];

const createGetCellContent =
  (
    reviews: ProductReviewFragment[],
    columns: AvailableColumn[],
    onApprove: (id: string) => void,
    onReject: (id: string) => void,
  ) =>
  ([column, row]: Item): GridCell => {
    const columnId = columns[column]?.id;
    const review = reviews[row];

    if (!columnId || !review) {
      return readonlyTextCell("");
    }

    switch (columnId) {
      case "product":
        return readonlyTextCell(review.product?.name || "");
      case "user":
        return readonlyTextCell(review.user?.email || "");
      case "rating":
        const rating = typeof review.rating === "number" ? review.rating : 0;
        return readonlyTextCell("⭐".repeat(rating));
      case "text":
        const text = review.text || "";
        const textPreview = text.length > 100 
          ? text.substring(0, 100) + "..." 
          : text;
        return readonlyTextCell(textPreview);
      case "images":
        const imageCount = [review.image1, review.image2].filter(Boolean).length;
        return readonlyTextCell(imageCount > 0 ? `${imageCount} фото` : "Нет фото");
      case "createdAt":
        try {
          // createdAt может быть строкой ISO или объектом Date
          const dateStr = typeof review.createdAt === "string" 
            ? review.createdAt 
            : review.createdAt?.toString() || "";
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) {
            return readonlyTextCell("");
          }
          return readonlyTextCell(
            date.toLocaleDateString("ru-RU", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        } catch {
          return readonlyTextCell("");
        }
      case "actions":
        return readonlyTextCell(""); // Действия будут через menuItems
      default:
        return readonlyTextCell("");
    }
  };

export const ProductReviewListDatagrid = ({
  reviews,
  loading,
  onApprove,
  onReject,
  onReviewClick,
}: ProductReviewListDatagridProps) => {
  const intl = useIntl();
  const datagridState = useDatagridChangeState();
  const columns = useMemo(() => productReviewColumns(intl), [intl]);

  const getCellContent = useCallback(
    createGetCellContent(reviews, columns, onApprove, onReject),
    [reviews, columns, onApprove, onReject],
  );

  const menuItems = useCallback(
    (index: number) => {
      const review = reviews[index];
      if (!review) return [];

      return [
        {
          label: intl.formatMessage({
            id: "productReview.action.approve",
            defaultMessage: "Опубликовать",
          }),
          onSelect: () => onApprove(review.id),
        },
        {
          label: intl.formatMessage({
            id: "productReview.action.reject",
            defaultMessage: "Отклонить",
          }),
          onSelect: () => onReject(review.id),
        },
      ];
    },
    [reviews, onApprove, onReject, intl],
  );

  const handleRowClick = useCallback(
    ([column, row]: Item) => {
      const review = reviews[row];
      if (review) {
        onReviewClick(review.id);
      }
    },
    [reviews, onReviewClick],
  );

  return (
    <DatagridChangeStateContext.Provider value={datagridState}>
      <Box padding={6}>
        <Datagrid
          readonly
          loading={loading}
          columnSelect={undefined}
          verticalBorder={false}
          rowMarkers="none"
          availableColumns={columns}
          rows={reviews.length}
          getCellContent={getCellContent}
          getCellError={() => false}
          emptyText={intl.formatMessage({
            id: "productReview.noData",
            defaultMessage: "Нет отзывов на модерацию",
          })}
          menuItems={menuItems}
          onRowClick={handleRowClick}
          selectionActions={() => null}
        />
      </Box>
    </DatagridChangeStateContext.Provider>
  );
};

