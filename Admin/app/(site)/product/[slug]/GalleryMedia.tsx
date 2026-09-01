'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { isVideo, type GalleryItem } from './galleryTypes';

type Props = {
  item: GalleryItem;
  alt?: string;
  className?: string;
  mediaRef?: React.Ref<HTMLImageElement | HTMLVideoElement>;
  /** Первый кадр / lightbox — без lazy */
  priority?: boolean;
  /**
   * Управление видео: true/false — принудительно;
   * undefined — play по IntersectionObserver (десктоп-сетка).
   */
  play?: boolean;
  sizes?: string;
};

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as React.MutableRefObject<T | null>).current = value;
}

export function GalleryMedia({
  item,
  alt,
  className,
  mediaRef,
  priority = false,
  play,
  sizes = '(max-width: 960px) 100vw, 50vw',
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!isVideo(item)) return;
    const el = localVideoRef.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const sync = (shouldPlay: boolean) => {
      if (reduced || !shouldPlay) {
        el.pause();
        return;
      }
      el.muted = true;
      void el.play().catch(() => {
        /* autoplay blocked */
      });
    };

    if (typeof play === 'boolean') {
      sync(play);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        sync(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.55));
      },
      { threshold: [0, 0.55, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item, play]);

  if (isVideo(item)) {
    return (
      <video
        ref={(el) => {
          localVideoRef.current = el;
          assignRef(mediaRef, el);
        }}
        className={className}
        src={item.url}
        muted
        loop
        playsInline
        preload="metadata"
        controls={false}
        aria-label={alt || 'Видео товара'}
      />
    );
  }

  return (
    <Image
      ref={mediaRef as React.Ref<HTMLImageElement>}
      className={className}
      src={item.url}
      alt={alt || ''}
      fill
      sizes={sizes}
      quality={78}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      unoptimized
    />
  );
}
