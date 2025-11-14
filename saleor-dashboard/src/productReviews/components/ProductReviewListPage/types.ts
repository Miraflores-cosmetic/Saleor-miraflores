// Тип будет импортирован из GraphQL
export type ProductReviewFragment = NonNullable<
  import("@dashboard/graphql").ProductReviewsPendingQuery["productReviewsPending"]
>[0];

