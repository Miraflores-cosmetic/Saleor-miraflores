'use client';

import styles from './CatalogPage.module.css';

export function CatalogPager({
  page,
  total,
  pageSize,
  pending,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  pageSize: number;
  pending: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!(total > pageSize || page > 1)) return null;

  return (
    <div className={styles.pager}>
      <button
        type="button"
        className={styles.pagerBtn}
        disabled={page <= 1 || pending}
        onClick={onPrev}
      >
        Назад
      </button>
      <span className={styles.pagerInfo}>
        {page} / {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <button
        type="button"
        className={styles.pagerBtn}
        disabled={pending || page * pageSize >= total}
        onClick={onNext}
      >
        Вперёд
      </button>
    </div>
  );
}
