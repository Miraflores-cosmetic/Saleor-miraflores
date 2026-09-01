import { Suspense } from 'react';
import { ReviewsListClient } from './ReviewsListClient';

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <ReviewsListClient />
    </Suspense>
  );
}
