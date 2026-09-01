'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatRub, type PublicCatalogTag } from '@/lib/publicCatalog';
import { CatalogChipDropdown } from './CatalogChipDropdown';
import { catalogHref } from './catalogHref';
import styles from './CatalogPage.module.css';

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Любая', min: null, max: null },
  { label: 'до 1 000 ₽', min: null, max: 1000 },
  { label: '1–3 тыс.', min: 1000, max: 3000 },
  { label: 'от 3 000 ₽', min: 3000, max: null },
];

export function CatalogFilters({
  tags,
  tag,
  sale,
  priceMin,
  priceMax,
  showClearCategory,
  clearCategoryLabel,
  searchParams,
  path,
  patchParams,
}: {
  tags: PublicCatalogTag[];
  tag: string;
  sale: boolean;
  priceMin: number | null;
  priceMax: number | null;
  showClearCategory: boolean;
  clearCategoryLabel: string;
  searchParams: URLSearchParams;
  path: { cat?: string; sub?: string };
  patchParams: (patch: Record<string, string | null>) => void;
}) {
  const [openChip, setOpenChip] = useState<string | null>(null);

  let priceChipLabel = 'цена';
  if (priceMin != null && priceMax != null) {
    priceChipLabel = `${formatRub(priceMin)}–${formatRub(priceMax)}`;
  } else if (priceMax != null) {
    priceChipLabel = `до ${formatRub(priceMax)}`;
  } else if (priceMin != null) {
    priceChipLabel = `от ${formatRub(priceMin)}`;
  }

  return (
    <div className={styles.chipsRow}>
      <CatalogChipDropdown
        id="price"
        label={priceChipLabel}
        open={openChip === 'price'}
        onToggle={() => setOpenChip((v) => (v === 'price' ? null : 'price'))}
        onClose={() => setOpenChip(null)}
      >
        {PRICE_PRESETS.map((p) => {
          const selected =
            (priceMin ?? null) === p.min && (priceMax ?? null) === p.max;
          return (
            <button
              key={p.label}
              type="button"
              role="option"
              aria-selected={selected}
              className={styles.chipOption}
              data-active={selected || undefined}
              onClick={() => {
                patchParams({
                  priceMin: p.min != null ? String(p.min) : null,
                  priceMax: p.max != null ? String(p.max) : null,
                });
                setOpenChip(null);
              }}
            >
              {p.label}
            </button>
          );
        })}
      </CatalogChipDropdown>

      <CatalogChipDropdown
        id="zone"
        label={
          tag
            ? tags.find((t) => t.slug === tag)?.name ?? 'области применения'
            : 'области применения'
        }
        open={openChip === 'zone'}
        onToggle={() => setOpenChip((v) => (v === 'zone' ? null : 'zone'))}
        onClose={() => setOpenChip(null)}
      >
        <button
          type="button"
          role="option"
          aria-selected={!tag}
          className={styles.chipOption}
          data-active={!tag || undefined}
          onClick={() => {
            patchParams({ tag: null });
            setOpenChip(null);
          }}
        >
          Все области
        </button>
        {tags.map((t) => {
          const selected = tag === t.slug;
          return (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={styles.chipOption}
              data-active={selected || undefined}
              onClick={() => {
                patchParams({ tag: selected ? null : t.slug });
                setOpenChip(null);
              }}
            >
              {t.name}
            </button>
          );
        })}
      </CatalogChipDropdown>

      <button
        type="button"
        className={styles.chip}
        data-active={sale || undefined}
        onClick={() => patchParams({ sale: sale ? null : '1' })}
      >
        со скидкой
      </button>

      {showClearCategory ? (
        <Link
          href={catalogHref(
            searchParams,
            { cat: null, sub: null, collection: null },
            path,
          )}
          className={styles.clearCategory}
        >
          {clearCategoryLabel}
        </Link>
      ) : null}
    </div>
  );
}
