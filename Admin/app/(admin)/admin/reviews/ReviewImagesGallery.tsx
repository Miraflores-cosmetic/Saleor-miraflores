'use client';

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useId, useRef, useState } from 'react';
import { AdminCompactBtn } from '@/components/AdminCompactBtn/AdminCompactBtn';
import {
  AdminBackendRequestError,
  adminBackendFetch,
  readAdminApiError,
} from '@/lib/adminBackendFetch';
import galleryStyles from '@/app/(admin)/admin/catalog/products/ProductGallery.module.css';

export type ReviewGalleryItem = { id: string; url: string };

const MAX_IMAGES = 2;

function SortableTile({
  image,
  index,
  busy,
  onRemove,
  onPreview,
}: {
  image: ReviewGalleryItem;
  index: number;
  busy: boolean;
  onRemove: () => void;
  onPreview: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled: busy || MAX_IMAGES < 2,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`${galleryStyles.tile} ${isDragging ? galleryStyles.tileDragging : ''}`}
    >
      <button
        type="button"
        className={galleryStyles.previewBtn}
        onClick={onPreview}
        aria-label={`Просмотр фото ${index + 1}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={galleryStyles.thumb} src={image.url} alt="" loading="lazy" />
      </button>
      <span className={galleryStyles.orderBadge}>{index + 1}</span>
      <div className={galleryStyles.tileActions}>
        <button
          type="button"
          className={galleryStyles.dragBtn}
          {...attributes}
          {...listeners}
          aria-label="Перетащить"
          disabled={busy}
        >
          ⋮⋮
        </button>
        <button
          type="button"
          className={galleryStyles.removeBtn}
          onClick={onRemove}
          aria-label="Удалить фото"
          disabled={busy}
        />
      </div>
    </li>
  );
}

function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: ReviewGalleryItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const image = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasNext, hasPrev, index, onClose, onIndexChange]);

  if (!image) return null;

  return (
    <div className={galleryStyles.lightboxBackdrop} role="dialog" aria-modal="true">
      <div className={galleryStyles.lightboxToolbar}>
        <span className={galleryStyles.lightboxCounter}>
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          className={galleryStyles.lightboxCloseBtn}
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
      {hasPrev ? (
        <button
          type="button"
          className={`${galleryStyles.lightboxNav} ${galleryStyles.lightboxNavPrev}`}
          onClick={() => onIndexChange(index - 1)}
          aria-label="Предыдущий"
        >
          ‹
        </button>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={galleryStyles.lightboxImage} src={image.url} alt="" />
      {hasNext ? (
        <button
          type="button"
          className={`${galleryStyles.lightboxNav} ${galleryStyles.lightboxNavNext}`}
          onClick={() => onIndexChange(index + 1)}
          aria-label="Следующий"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}

/** Локальная галерея отзыва: до 2 фото, DnD, lightbox. URL сохраняются с формой. */
export function ReviewImagesGallery({
  images,
  onChange,
}: {
  images: ReviewGalleryItem[];
  onChange: (next: ReviewGalleryItem[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canAdd = images.length < MAX_IMAGES;

  async function onPick(fileList: FileList | null) {
    if (!fileList?.length || !canAdd) return;
    const room = MAX_IMAGES - images.length;
    const files = Array.from(fileList).slice(0, room);
    setBusy(true);
    setError(null);
    let next = images;
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await adminBackendFetch('reviews/admin/upload', {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) throw new AdminBackendRequestError(await readAdminApiError(res), res.status);
        const json = (await res.json()) as { url: string };
        next = [
          ...next,
          { id: `${idPrefix}-${Date.now()}-${next.length}`, url: json.url },
        ];
        onChange(next);
      }
    } catch (e) {
      setError(e instanceof AdminBackendRequestError ? e.message : 'Не удалось загрузить');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = images.findIndex((i) => i.id === active.id);
    const newIndex = images.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(images, oldIndex, newIndex));
  }

  return (
    <div className={galleryStyles.root}>
      <div className={galleryStyles.metaRow}>
        <h2 className={galleryStyles.title}>Галерея</h2>
        <p className={galleryStyles.count}>
          {images.length} / {MAX_IMAGES}
        </p>
        <AdminCompactBtn
          type="button"
          variant="outline"
          disabled={busy || !canAdd}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Загрузка…' : 'Добавить фото'}
        </AdminCompactBtn>
      </div>
      <p className={galleryStyles.hint}>Максимум 2 фото. Порядок — перетаскиванием.</p>
      <input
        ref={inputRef}
        className={galleryStyles.fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        disabled={busy || !canAdd}
        onChange={(e) => void onPick(e.target.files)}
      />
      {error ? (
        <p className={galleryStyles.error} role="alert">
          {error}
        </p>
      ) : null}
      {images.length === 0 ? (
        <p className={galleryStyles.hint}>Фото пока нет</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
            <ul className={galleryStyles.grid}>
              {images.map((image, index) => (
                <SortableTile
                  key={image.id}
                  image={image}
                  index={index}
                  busy={busy}
                  onPreview={() => setPreviewIndex(index)}
                  onRemove={() => onChange(images.filter((x) => x.id !== image.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {previewIndex != null ? (
        <Lightbox
          images={images}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
      ) : null}
    </div>
  );
}

export function urlsToGallery(
  image1Url: string | null | undefined,
  image2Url: string | null | undefined,
  idPrefix: string,
): ReviewGalleryItem[] {
  const out: ReviewGalleryItem[] = [];
  if (image1Url) out.push({ id: `${idPrefix}-1`, url: image1Url });
  if (image2Url) out.push({ id: `${idPrefix}-2`, url: image2Url });
  return out;
}

export function galleryToUrls(images: ReviewGalleryItem[]): {
  image1Url: string | null;
  image2Url: string | null;
} {
  return {
    image1Url: images[0]?.url ?? null,
    image2Url: images[1]?.url ?? null,
  };
}
