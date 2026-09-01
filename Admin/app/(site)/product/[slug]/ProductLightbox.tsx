'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadAnime } from '@/lib/anime';
import { GalleryMedia } from './GalleryMedia';
import { finalContainRect, readAspect, rectFromElement } from './galleryGeometry';
import { prefersReducedMotion, type GalleryItem, type OriginRect } from './galleryTypes';
import styles from './ProductGallery.module.css';

const OPEN_MS = 720;
const CLOSE_MS = 560;
const EASE_OPEN = 'outCubic';
const EASE_CLOSE = 'inOutCubic';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  images: GalleryItem[];
  productName: string;
  index: number;
  origin: OriginRect;
  returnFocusEl: HTMLElement | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

function waitAnime(anim: { then: (cb?: () => void) => unknown }): Promise<void> {
  return new Promise((resolve) => {
    void anim.then(() => resolve());
  });
}

export function ProductLightbox({
  images,
  productName,
  index,
  origin,
  returnFocusEl,
  onIndexChange,
  onClose,
}: Props) {
  const list = images;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const animRef = useRef<{ pause?: () => void; cancel?: () => void } | null>(null);
  const flipPendingRef = useRef(true);
  const originRef = useRef(origin);
  const prevIndexRef = useRef(index);
  const [phase, setPhase] = useState<'open' | 'closing'>('open');

  const stopAnim = useCallback(() => {
    animRef.current?.pause?.();
    animRef.current?.cancel?.();
    animRef.current = null;
  }, []);

  const fitCurrentSlide = useCallback(() => {
    const stage = shellRef.current?.querySelector<HTMLElement>(`.${styles.lightboxStage}`);
    if (!stage) return;
    const aspect = readAspect(mediaRef.current, 4 / 5);
    const last = finalContainRect(aspect);
    Object.assign(stage.style, {
      top: `${last.top}px`,
      left: `${last.left}px`,
      width: `${last.width}px`,
      height: `${last.height}px`,
      borderRadius: '0px',
      opacity: '1',
    });
  }, []);

  const closeLightbox = useCallback(async () => {
    if (phase === 'closing') return;
    if (prefersReducedMotion()) {
      stopAnim();
      onClose();
      return;
    }

    const target = returnFocusEl ? rectFromElement(returnFocusEl) : originRef.current;
    if (!shellRef.current) {
      onClose();
      return;
    }

    setPhase('closing');
    stopAnim();
    const shell = shellRef.current;
    const backdrop = shell.querySelector<HTMLElement>(`.${styles.lightboxBackdrop}`);
    const stage = shell.querySelector<HTMLElement>(`.${styles.lightboxStage}`);
    const chrome = shell.querySelectorAll<HTMLElement>(`.${styles.lightboxChrome}`);

    try {
      const { animate } = await loadAnime();
      const jobs: Array<Promise<void>> = [];
      if (backdrop) {
        jobs.push(
          waitAnime(
            animate(backdrop, {
              opacity: [Number(backdrop.style.opacity || 1), 0],
              duration: CLOSE_MS,
              ease: EASE_CLOSE,
            }),
          ),
        );
      }
      chrome.forEach((el) => {
        jobs.push(
          waitAnime(
            animate(el, {
              opacity: [1, 0],
              duration: CLOSE_MS * 0.45,
              ease: EASE_CLOSE,
            }),
          ),
        );
      });
      if (stage) {
        jobs.push(
          waitAnime(
            animate(stage, {
              top: `${target.top}px`,
              left: `${target.left}px`,
              width: `${target.width}px`,
              height: `${target.height}px`,
              borderRadius: '4px',
              duration: CLOSE_MS,
              ease: EASE_CLOSE,
            }),
          ),
        );
      }
      await Promise.all(jobs);
    } finally {
      stopAnim();
      onClose();
    }
  }, [onClose, phase, returnFocusEl, stopAnim]);

  // FLIP open once on mount
  useLayoutEffect(() => {
    if (!shellRef.current || !flipPendingRef.current) return;
    flipPendingRef.current = false;

    const shell = shellRef.current;
    const backdrop = shell.querySelector<HTMLElement>(`.${styles.lightboxBackdrop}`);
    const stage = shell.querySelector<HTMLElement>(`.${styles.lightboxStage}`);
    const chrome = shell.querySelectorAll<HTMLElement>(`.${styles.lightboxChrome}`);
    if (!stage || !backdrop) return;

    const first = originRef.current;
    const run = async () => {
      const media = mediaRef.current;
      const aspect = readAspect(media, first.width / Math.max(1, first.height));
      const last = finalContainRect(aspect);

      Object.assign(stage.style, {
        top: `${first.top}px`,
        left: `${first.left}px`,
        width: `${first.width}px`,
        height: `${first.height}px`,
        borderRadius: '4px',
        opacity: '1',
      });
      backdrop.style.opacity = '0';
      chrome.forEach((el) => {
        el.style.opacity = '0';
      });

      if (prefersReducedMotion()) {
        Object.assign(stage.style, {
          top: `${last.top}px`,
          left: `${last.left}px`,
          width: `${last.width}px`,
          height: `${last.height}px`,
          borderRadius: '0px',
        });
        backdrop.style.opacity = '1';
        chrome.forEach((el) => {
          el.style.opacity = '1';
        });
        return;
      }

      const { animate } = await loadAnime();
      stopAnim();
      const tw = animate(stage, {
        top: [`${first.top}px`, `${last.top}px`],
        left: [`${first.left}px`, `${last.left}px`],
        width: [`${first.width}px`, `${last.width}px`],
        height: [`${first.height}px`, `${last.height}px`],
        borderRadius: ['4px', '0px'],
        duration: OPEN_MS,
        ease: EASE_OPEN,
      });
      animRef.current = tw;
      animate(backdrop, {
        opacity: [0, 1],
        duration: OPEN_MS * 0.75,
        ease: EASE_OPEN,
      });
      chrome.forEach((el) => {
        animate(el, {
          opacity: [0, 1],
          duration: OPEN_MS * 0.55,
          delay: OPEN_MS * 0.35,
          ease: EASE_OPEN,
        });
      });
      await waitAnime(tw);
    };

    void run();
  }, [stopAnim]);

  // Slide change: refit contain box without FLIP
  useLayoutEffect(() => {
    if (prevIndexRef.current !== index) {
      requestAnimationFrame(() => fitCurrentSlide());
    }
    prevIndexRef.current = index;
  }, [index, fitCurrentSlide]);

  const indexRef = useRef(index);
  const listLenRef = useRef(list.length);
  const closeRef = useRef(closeLightbox);
  const onIndexChangeRef = useRef(onIndexChange);
  const returnFocusRef = useRef(returnFocusEl);
  indexRef.current = index;
  listLenRef.current = list.length;
  closeRef.current = closeLightbox;
  onIndexChangeRef.current = onIndexChange;
  returnFocusRef.current = returnFocusEl;

  // Свайп между кадрами (стрелки на мобе скрыты)
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || list.length <= 1) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      startX = e.touches[0]!.clientX;
      startY = e.touches[0]!.clientY;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking || e.changedTouches.length !== 1) return;
      tracking = false;
      const dx = e.changedTouches[0]!.clientX - startX;
      const dy = e.changedTouches[0]!.clientY - startY;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      const len = listLenRef.current;
      const i = indexRef.current;
      if (dx < 0) onIndexChangeRef.current((i + 1) % len);
      else onIndexChangeRef.current((i - 1 + len) % len);
    };

    shell.addEventListener('touchstart', onStart, { passive: true });
    shell.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      shell.removeEventListener('touchstart', onStart);
      shell.removeEventListener('touchend', onEnd);
    };
  }, [list.length]);

  // Keyboard + body scroll lock + focus trap (once per open session)
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const closeBtn = shell.querySelector<HTMLElement>(`.${styles.lightboxClose}`);
    (closeBtn ?? shell).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void closeRef.current();
        return;
      }
      const len = listLenRef.current;
      const i = indexRef.current;
      if (e.key === 'ArrowRight' && len > 1) {
        e.preventDefault();
        onIndexChangeRef.current((i + 1) % len);
        return;
      }
      if (e.key === 'ArrowLeft' && len > 1) {
        e.preventDefault();
        onIndexChangeRef.current((i - 1 + len) % len);
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = focusablesIn(shell);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first || !shell.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !shell.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);
  const item = list[index];
  if (!item) return null;

  return createPortal(
    <div
      ref={shellRef}
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр медиа"
      data-closing={phase === 'closing' || undefined}
      tabIndex={-1}
    >
      <button
        type="button"
        className={styles.lightboxBackdrop}
        aria-label="Закрыть"
        onClick={() => void closeLightbox()}
      />

      <button
        type="button"
        className={`${styles.lightboxClose} ${styles.lightboxChrome}`}
        onClick={() => void closeLightbox()}
        aria-label="Закрыть"
      >
        ×
      </button>

      {list.length > 1 ? (
        <>
          <button
            type="button"
            className={`${styles.lightboxNav} ${styles.lightboxPrev} ${styles.lightboxChrome}`}
            aria-label="Предыдущее"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index - 1 + list.length) % list.length);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.lightboxNav} ${styles.lightboxNext} ${styles.lightboxChrome}`}
            aria-label="Следующее"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index + 1) % list.length);
            }}
          >
            ›
          </button>
        </>
      ) : null}

      <div className={styles.lightboxStage}>
        <GalleryMedia
          key={`${item.url}-${index}`}
          item={item}
          className={styles.lightboxMedia}
          alt={productName}
          mediaRef={mediaRef}
          priority
          play
          sizes="100vw"
        />
      </div>
    </div>,
    document.body,
  );
}
