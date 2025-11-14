import { DashboardModal } from "@dashboard/components/Modal";
import { ProductReviewFragment } from "../ProductReviewListPage/types";
import { Box, Button, Text } from "@saleor/macaw-ui-next";
import { useIntl, FormattedMessage } from "react-intl";

interface ProductReviewDetailDialogProps {
  open: boolean;
  onClose: () => void;
  review: ProductReviewFragment | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const ProductReviewDetailDialog = ({
  open,
  onClose,
  review,
  onApprove,
  onReject,
}: ProductReviewDetailDialogProps) => {
  const intl = useIntl();

  if (!review) {
    return null;
  }

  const handleApprove = () => {
    onApprove(review.id);
    onClose();
  };

  const handleReject = () => {
    onReject(review.id);
    onClose();
  };

  const formatDate = (date: any) => {
    try {
      const dateStr = typeof date === "string" ? date : date?.toString() || "";
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) {
        return "";
      }
      return dateObj.toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <DashboardModal open={open} onChange={onClose}>
      <DashboardModal.Content size="md">
        <DashboardModal.Header>
          <FormattedMessage
            id="productReview.dialog.title"
            defaultMessage="Детали отзыва"
          />
        </DashboardModal.Header>

        <Box display="grid" gap={6} paddingTop={4}>
          {/* Информация о товаре */}
          <Box>
            <Text fontSize={2} fontWeight="medium" marginBottom={1}>
              <FormattedMessage
                id="productReview.dialog.product"
                defaultMessage="Товар"
              />
            </Text>
            <Box marginTop={2}>
              <Text fontSize={3}>{review.product?.name || "—"}</Text>
            </Box>
          </Box>

          <Box style={{ borderTop: "1px solid var(--colorDefault1)" }} />

          {/* Информация о пользователе */}
          <Box>
            <Text fontSize={2} fontWeight="medium" marginBottom={1}>
              <FormattedMessage
                id="productReview.dialog.user"
                defaultMessage="Пользователь"
              />
            </Text>
            <Box marginTop={2}>
              <Text fontSize={3}>
                {review.user?.email || "—"}
                {review.user?.firstName || review.user?.lastName
                  ? ` (${[review.user.firstName, review.user.lastName]
                      .filter(Boolean)
                      .join(" ")})`
                  : ""}
              </Text>
            </Box>
          </Box>

          <Box style={{ borderTop: "1px solid var(--colorDefault1)" }} />

          {/* Рейтинг */}
          <Box>
            <Text fontSize={2} fontWeight="medium" marginBottom={1}>
              <FormattedMessage
                id="productReview.dialog.rating"
                defaultMessage="Рейтинг"
              />
            </Text>
            <Box marginTop={2}>
              <Text fontSize={4}>
                {"⭐".repeat(typeof review.rating === "number" ? review.rating : 0)}
              </Text>
            </Box>
          </Box>

          <Box style={{ borderTop: "1px solid var(--colorDefault1)" }} />

          {/* Текст отзыва */}
          <Box>
            <Text fontSize={2} fontWeight="medium" marginBottom={1}>
              <FormattedMessage
                id="productReview.dialog.text"
                defaultMessage="Текст отзыва"
              />
            </Text>
            <Box marginTop={2}>
              <Text fontSize={3} style={{ whiteSpace: "pre-wrap" }}>
                {review.text || "—"}
              </Text>
            </Box>
          </Box>

          {/* Изображения */}
          {(review.image1 || review.image2) && (
            <>
              <Box style={{ borderTop: "1px solid var(--colorDefault1)" }} />
              <Box>
                <Text fontSize={2} fontWeight="medium" marginBottom={1}>
                  <FormattedMessage
                    id="productReview.dialog.images"
                    defaultMessage="Изображения"
                  />
                </Text>
                <Box display="flex" gap={4} flexWrap="wrap" marginTop={2}>
                  {review.image1 && (
                    <Box
                      as="img"
                      src={review.image1}
                      alt="Изображение отзыва 1"
                      style={{ maxWidth: "300px", maxHeight: "300px", objectFit: "contain" }}
                      borderRadius={2}
                      borderWidth={1}
                      borderStyle="solid"
                      borderColor="default1"
                      cursor="pointer"
                      onClick={() => window.open(review.image1!, "_blank")}
                    />
                  )}
                  {review.image2 && (
                    <Box
                      as="img"
                      src={review.image2}
                      alt="Изображение отзыва 2"
                      style={{ maxWidth: "300px", maxHeight: "300px", objectFit: "contain" }}
                      borderRadius={2}
                      borderWidth={1}
                      borderStyle="solid"
                      borderColor="default1"
                      cursor="pointer"
                      onClick={() => window.open(review.image2!, "_blank")}
                    />
                  )}
                </Box>
              </Box>
            </>
          )}

          <Box style={{ borderTop: "1px solid var(--colorDefault1)" }} />

          {/* Дата создания */}
          <Box>
            <Text fontSize={2} fontWeight="medium" marginBottom={1}>
              <FormattedMessage
                id="productReview.dialog.createdAt"
                defaultMessage="Дата создания"
              />
            </Text>
            <Box marginTop={2}>
              <Text fontSize={3}>{formatDate(review.createdAt) || "—"}</Text>
            </Box>
          </Box>
        </Box>

        <DashboardModal.Actions>
          <Button variant="secondary" onClick={onClose}>
            <FormattedMessage
              id="productReview.dialog.close"
              defaultMessage="Закрыть"
            />
          </Button>
          <Button variant="error" onClick={handleReject}>
            <FormattedMessage
              id="productReview.dialog.reject"
              defaultMessage="Отклонить"
            />
          </Button>
          <Button variant="primary" onClick={handleApprove}>
            <FormattedMessage
              id="productReview.dialog.approve"
              defaultMessage="Опубликовать"
            />
          </Button>
        </DashboardModal.Actions>
      </DashboardModal.Content>
    </DashboardModal>
  );
};

