export type GalleryItem = {
  url: string;
  mediaType?: 'image' | 'video';
};

export type OriginRect = { top: number; left: number; width: number; height: number };

export function isVideo(item: GalleryItem): boolean {
  if (item.mediaType === 'video') return true;
  return /\.(mp4|mov)(\?|$)/i.test(item.url);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
