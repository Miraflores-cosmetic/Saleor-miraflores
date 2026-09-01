import { ReviewFormClient } from '../ReviewFormClient';

export default function AdminReviewEditPage({
  params,
}: {
  params: { id: string };
}) {
  return <ReviewFormClient reviewId={params.id} />;
}
