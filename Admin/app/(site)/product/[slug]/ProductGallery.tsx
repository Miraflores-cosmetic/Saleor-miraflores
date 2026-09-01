'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GalleryMedia } from './GalleryMedia';
import { rectFromElement } from './galleryGeometry';
import { isVideo, type GalleryItem, type OriginRect } from './galleryTypes';
import { ProductLightbox } from './ProductLightbox';
import styles from './ProductGallery.module.css';

export type { GalleryItem } from './galleryTypes';

type Props = {
  images: GalleryItem[];
  productName: string;
};

type OpenState = {
  index: number;
  origin: OriginRect;
  returnFocusEl: HTMLElement | null;
};

function subscribeCarouselMq(onChange: () => void) {
  const mq = window.matchMedia('(max-width: 960px)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getCarouselMq() {
  return window.matchMedia('(max-width: 960px)').matches;
}

export function ProductGallery({ images, productName }: Props) {
  const list = images.length > 0 ? images : [];
  const frameRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [open, setOpen] = useState<OpenState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isCarousel = useSyncExternalStore(subscribeCarouselMq, getCarouselMq, () => false);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    setActiveIndex(0);
    const track = trackRef.current;
    if (track) track.scrollLeft = 0;
  }, [list]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || list.length <= 1) return;

    const onScroll = () => {
      const w = track.clientWidth;
      if (w <= 0) return;
      const next = Math.round(track.scrollLeft / w);
      setActiveIndex(Math.max(0, Math.min(list.length - 1, next)));
    };

    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, [list.length]);

  const openAt = useCallback((i: number) => {
    const frame = frameRefs.current[i];
    if (!frame) return;
    setOpen({
      index: i,
      origin: rectFromElement(frame),
      returnFocusEl: frame,
    });
  }, []);

  const closeLightbox = useCallback(() => setOpen(null), []);

  const setLightboxIndex = useCallback((index: number) => {
    setOpen((prev) => {
      if (!prev) return prev;
      const frame = frameRefs.current[index];
      return {
        ...prev,
        index,
        returnFocusEl: frame ?? prev.returnFocusEl,
      };
    });
  }, []);

  const scrollToIndex = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  }, []);

  return (
    <div className={styles.gallery}>
      <div className={styles.grid} ref={trackRef}>
        {list.length > 0 ? (
          list.map((item, i) => (
            <button
              key={`${item.url}-${i}`}
              type="button"
              ref={(el) => {
                frameRefs.current[i] = el;
              }}
              className={styles.frame}
              data-lightbox-active={open && open.index === i ? true : undefined}
              onClick={() => openAt(i)}
              aria-label={
                isVideo(item)
                  ? `Открыть видео ${i + 1} во весь экран`
                  : `Открыть фото ${i + 1} во весь экран`
              }
            >
              <GalleryMedia
                item={item}
                className={styles.mainMedia}
                alt={i === 0 ? productName : ''}
                priority={i === 0}
                play={isCarousel ? i === activeIndex && !open : undefined}
                sizes="(max-width: 960px) 100vw, 50vw"
              />
            </button>
          ))
        ) : (
          <div className={styles.frame} aria-hidden>
            <div className={styles.placeholder} />
          </div>
        )}
      </div>

      {list.length > 1 ? (
        <div className={styles.dots} role="tablist" aria-label="Фото товара">
          {list.map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              className={styles.dot}
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Фото ${i + 1}`}
              data-active={i === activeIndex || undefined}
              onClick={() => scrollToIndex(i)}
            />
          ))}
        </div>
      ) : null}

      {portalReady && open ? (
        <ProductLightbox
          images={list}
          productName={productName}
          index={open.index}
          origin={open.origin}
          returnFocusEl={open.returnFocusEl}
          onIndexChange={setLightboxIndex}
          onClose={closeLightbox}
        />
      ) : null}
    </div>
  );
}
