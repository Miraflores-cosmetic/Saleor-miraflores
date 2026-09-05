'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminCheckbox } from '@/components/admin/AdminCheckbox/AdminCheckbox';
import { AdminCompactBtn, AdminCompactBtnLink } from '@/components/AdminCompactBtn/AdminCompactBtn';
import { AdminListPagination } from '@/components/admin/AdminListPagination/AdminListPagination';
import { AdminListShell } from '@/components/admin/AdminListShell/AdminListShell';
import {
  AdminSortableTable,
  DragHandleCell,
} from '@/components/admin/AdminSortableTable/AdminSortableTable';
import { AdminTabs } from '@/components/AdminTabs/AdminTabs';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { AdminSearchBox } from '@/components/SearchBox/SearchBox';
import { useToast } from '@/components/Toast/ToastProvider';
import {
  AdminBackendRequestError,
  adminBackendJson,
} from '@/lib/adminBackendFetch';
import { formatAdminDateTime } from '@/lib/adminFormat';
import {
  parseReviewStatusFilter,
  type AdminReviewCounts,
  type AdminReviewListResponse,
  type AdminReviewRow,
  type AdminReviewStatusFilter,
} from '@/lib/adminReviewsTypes';
import { useAdminPaginatedList } from '@/lib/useAdminPaginatedList';
import styles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';

const PAGE_LIMIT = 20;

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function tabLabel(base: string, n: number | undefined): string {
  return n == null ? base : `${base} (${n})`;
}

function isVideoUrl(url: string | null | undefined): boolean {
  return Boolean(url && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url));
}

function reviewPreviewLabel(r: AdminReviewRow): string {
  const text = r.text?.trim() || '';
  if (text) return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  const media = r.image1Url?.trim() || r.image2Url?.trim() || '';
  if (isVideoUrl(media)) return 'Видео';
  if (media) return 'Фото';
  return 'Без текста';
}

type ConfirmKind = 'delete' | 'reject' | 'bulk-delete' | 'bulk-reject' | 'bulk-publish';

export function ReviewsListClient() {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<AdminReviewStatusFilter>(() =>
    parseReviewStatusFilter(searchParams.get('status')),
  );
  const [productId, setProductId] = useState(() => searchParams.get('productId') ?? '');
  const [productName, setProductName] = useState<string | null>(null);
  const [counts, setCounts] = useState<AdminReviewCounts | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<{
    kind: ConfirmKind;
    row?: AdminReviewRow;
  } | null>(null);

  const initialQ = searchParams.get('q') ?? '';
  const initialPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const filterKey = `${status}|${productId}`;
  const sortable = status === 'published';

  const buildPath = useCallback(
    ({ page, limit, q }: { page: number; limit: number; q: string }) => {
      const sp = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status,
      });
      if (q) sp.set('q', q);
      if (productId) sp.set('productId', productId);
      return `reviews/admin?${sp}`;
    },
    [productId, status],
  );

  const onResponse = useCallback((res: { items: AdminReviewRow[] }) => {
    const full = res as AdminReviewListResponse;
    if (full.counts) setCounts(full.counts);
  }, []);

  const {
    q,
    setQ,
    qDebounced,
    page,
    setPage,
    loading,
    fetching,
    error,
    items,
    setItems,
    total,
    dataPage,
    dataLimit,
    reload,
    searching,
  } = useAdminPaginatedList<AdminReviewRow>({
    buildPath,
    limit: PAGE_LIMIT,
    filterKey,
    initialQ,
    initialPage,
    errorFallback: 'Не удалось загрузить отзывы',
    onResponse,
  });

  useEffect(() => {
    setSelected(new Set());
  }, [filterKey, qDebounced, page]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (status !== 'pending') sp.set('status', status);
    if (productId) sp.set('productId', productId);
    if (qDebounced.trim()) sp.set('q', qDebounced.trim());
    if (page > 1) sp.set('page', String(page));
    const next = sp.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [page, pathname, productId, qDebounced, router, searchParams, status]);

  useEffect(() => {
    if (!productId) {
      setProductName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await adminBackendJson<{ name: string }>(
          `catalog/admin/products/${productId}`,
        );
        if (!cancelled) setProductName(p.name);
      } catch {
        if (!cancelled) setProductName(productId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = items.length > 0 && items.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((r) => r.id)));
  }

  async function publish(row: AdminReviewRow) {
    setBusyId(row.id);
    try {
      await adminBackendJson(`reviews/admin/${row.id}/publish`, { method: 'POST' });
      showToast('Отзыв опубликован');
      await reload();
    } catch (e) {
      showToast(
        e instanceof AdminBackendRequestError ? e.message : 'Не удалось опубликовать',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeIds(ids: string[], toastOk: string) {
    for (const id of ids) {
      await adminBackendJson(`reviews/admin/${id}`, { method: 'DELETE' });
    }
    showToast(toastOk);
    setSelected(new Set());
    await reload();
  }

  async function publishIds(ids: string[]) {
    for (const id of ids) {
      await adminBackendJson(`reviews/admin/${id}/publish`, { method: 'POST' });
    }
    showToast(ids.length === 1 ? 'Отзыв опубликован' : `Опубликовано: ${ids.length}`);
    setSelected(new Set());
    await reload();
  }

  async function reorder(orderedIds: string[]) {
    const prev = items;
    setItems((cur) => {
      const map = new Map(cur.map((r) => [r.id, r]));
      return orderedIds.map((id) => map.get(id)!).filter(Boolean);
    });
    try {
      await adminBackendJson('reviews/admin/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds }),
      });
    } catch (e) {
      setItems(prev);
      showToast(
        e instanceof AdminBackendRequestError ? e.message : 'Не удалось сохранить порядок',
      );
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    const kind = confirm.kind;
    const row = confirm.row;
    setConfirm(null);
    try {
      if (kind === 'delete' && row) {
        setBusyId(row.id);
        await removeIds([row.id], 'Отзыв удалён');
      } else if (kind === 'reject' && row) {
        setBusyId(row.id);
        await removeIds([row.id], 'Отзыв отклонён');
      } else if (kind === 'bulk-delete') {
        setBulkBusy(true);
        await removeIds([...selected], `Удалено: ${selected.size}`);
      } else if (kind === 'bulk-reject') {
        setBulkBusy(true);
        await removeIds([...selected], `Отклонено: ${selected.size}`);
      } else if (kind === 'bulk-publish') {
        setBulkBusy(true);
        await publishIds([...selected]);
      }
    } catch (e) {
      showToast(e instanceof AdminBackendRequestError ? e.message : 'Операция не удалась');
    } finally {
      setBusyId(null);
      setBulkBusy(false);
    }
  }

  const emptyLabel = searching
    ? 'Ничего не найдено'
    : productId
      ? 'У этого товара нет отзывов'
      : status === 'pending'
        ? 'Очередь модерации пуста'
        : 'Отзывов нет';

  const confirmCopy =
    confirm?.kind === 'reject' || confirm?.kind === 'bulk-reject'
      ? {
          title:
            confirm.kind === 'bulk-reject'
              ? `Отклонить выбранные (${selected.size})?`
              : 'Отклонить отзыв?',
          message: 'Отзыв будет удалён безвозвратно.',
          confirmLabel: 'Отклонить',
        }
      : confirm?.kind === 'bulk-publish'
        ? {
            title: `Опубликовать выбранные (${selected.size})?`,
            message: 'Отзывы появятся на витрине.',
            confirmLabel: 'Опубликовать',
          }
        : {
            title:
              confirm?.kind === 'bulk-delete'
                ? `Удалить выбранные (${selected.size})?`
                : 'Удалить отзыв?',
            message: 'Отзыв будет удалён безвозвратно.',
            confirmLabel: 'Удалить',
          };

  function renderRowCells(r: AdminReviewRow, drag?: Parameters<typeof DragHandleCell>[0]) {
    return (
      <>
        <td>
          <AdminCheckbox
            className={styles.adminCheckboxInTable}
            checked={selected.has(r.id)}
            onChange={() => toggleOne(r.id)}
            aria-label="Выбрать отзыв"
          />
        </td>
        {drag ? <DragHandleCell {...drag} /> : null}
        <td>
          <span>{r.product.name}</span>
          <div className={styles.mutedInline}>
            <Link href={`/admin/catalog/products/${r.product.id}`}>карточка</Link>
            {' · '}
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setProductId(r.product.id);
                setStatus('all');
              }}
            >
              фильтр
            </button>
            {r.orderId ? <> · заказ {r.orderId.slice(0, 8)}…</> : null}
          </div>
        </td>
        <td>{r.rating}</td>
        <td>
          <Link href={`/admin/reviews/${r.id}`} title={r.text || undefined}>
            {reviewPreviewLabel(r)}
          </Link>
          {r.image1Url || r.image2Url ? (
            <span className={styles.mutedInline}> · медиа</span>
          ) : null}
        </td>
        <td className={styles.mutedInline}>{formatAdminDateTime(r.createdAt)}</td>
        <td className={styles.mutedInline}>
          {r.moderatedAt ? formatAdminDateTime(r.moderatedAt) : '—'}
        </td>
        <td>
          <span
            className={`${styles.badge} ${
              r.isPublished ? styles.badgeOn : styles.badgeDraft
            }`}
          >
            {r.isPublished ? 'Опубликован' : 'На модерации'}
          </span>
        </td>
        <td className={styles.tableCellActions}>
          <div className={styles.actionGroup}>
            <AdminCompactBtnLink
              href={`/admin/reviews/${r.id}`}
              variant="outline"
              className={styles.iconBtn}
              aria-label="Изменить отзыв"
              title="Изменить"
            >
              <EditIcon />
            </AdminCompactBtnLink>
            {!r.isPublished ? (
              <>
                <AdminCompactBtn
                  type="button"
                  variant="accent"
                  disabled={busyId === r.id || bulkBusy}
                  onClick={() => void publish(r)}
                >
                  Опубликовать
                </AdminCompactBtn>
                <AdminCompactBtn
                  type="button"
                  variant="outline"
                  disabled={busyId === r.id || bulkBusy}
                  onClick={() => setConfirm({ kind: 'reject', row: r })}
                >
                  Отклонить
                </AdminCompactBtn>
              </>
            ) : null}
            <AdminCompactBtn
              type="button"
              variant="danger"
              className={styles.iconDangerBtn}
              disabled={busyId === r.id || bulkBusy}
              onClick={() => setConfirm({ kind: 'delete', row: r })}
              aria-label="Удалить отзыв"
              title="Удалить"
            >
              <TrashIcon />
            </AdminCompactBtn>
          </div>
        </td>
      </>
    );
  }

  const head = (
    <tr>
      <th style={{ width: 40 }}>
        <AdminCheckbox
          className={styles.adminCheckboxInTable}
          checked={allSelected}
          onChange={toggleAll}
          aria-label="Выбрать все на странице"
        />
      </th>
      {sortable ? <th style={{ width: 36 }} aria-label="Порядок" /> : null}
      <th>Товар</th>
      <th>★</th>
      <th>Текст</th>
      <th>Дата</th>
      <th>Модерация</th>
      <th>Статус</th>
      <th />
    </tr>
  );

  return (
    <>
      <h1 className={styles.title}>Отзывы</h1>

      <AdminTabs
        ariaLabel="Фильтр по статусу"
        activeId={status}
        onChange={(id) => setStatus(id as AdminReviewStatusFilter)}
        items={[
          { id: 'pending', label: tabLabel('На модерации', counts?.pending) },
          { id: 'published', label: tabLabel('Опубликованные', counts?.published) },
          { id: 'all', label: tabLabel('Все', counts?.all) },
        ]}
      />

      <AdminListShell
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        loadingLabel="Загрузка…"
        empty={emptyLabel}
        isEmpty={!loading && items.length === 0}
        isFetching={fetching}
        wrapContent={false}
        toolbar={
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchBoxToolbar}>
                <AdminSearchBox
                  placeholder="Текст, товар, автор…"
                  ariaLabel="Поиск отзывов"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {productId ? (
                <span className={styles.mutedInline}>
                  Товар: {productName ?? '…'}{' '}
                  <AdminCompactBtn
                    type="button"
                    variant="outline"
                    onClick={() => setProductId('')}
                  >
                    Сбросить
                  </AdminCompactBtn>
                </span>
              ) : null}
              {selected.size > 0 ? (
                <>
                  <AdminCompactBtn
                    type="button"
                    variant="accent"
                    disabled={bulkBusy}
                    onClick={() => setConfirm({ kind: 'bulk-publish' })}
                  >
                    Опубликовать ({selected.size})
                  </AdminCompactBtn>
                  <AdminCompactBtn
                    type="button"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => setConfirm({ kind: 'bulk-reject' })}
                  >
                    Отклонить ({selected.size})
                  </AdminCompactBtn>
                  <AdminCompactBtn
                    type="button"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => setConfirm({ kind: 'bulk-delete' })}
                  >
                    Удалить ({selected.size})
                  </AdminCompactBtn>
                </>
              ) : null}
            </div>
            <AdminCompactBtnLink href="/admin/reviews/new" variant="accent">
              Добавить отзыв
            </AdminCompactBtnLink>
          </div>
        }
        pagination={
          !loading && !error ? (
            <AdminListPagination
              page={dataPage}
              total={total}
              limit={dataLimit}
              onPageChange={setPage}
              disabled={fetching}
            />
          ) : null
        }
      >
        {sortable ? (
          <AdminSortableTable
            ids={items.map((r) => r.id)}
            onReorder={reorder}
            head={head}
            renderRow={(id, drag) => {
              const r = items.find((x) => x.id === id)!;
              return renderRowCells(r, drag);
            }}
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>{head}</thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>{renderRowCells(r)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminListShell>

      <ConfirmDialog
        open={confirm != null}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        danger={confirm?.kind !== 'bulk-publish'}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
