import type { OriginRect } from './galleryTypes';

function readSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';');
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const top = parseFloat(cs.paddingTop) || 0;
  const right = parseFloat(cs.paddingRight) || 0;
  const bottom = parseFloat(cs.paddingBottom) || 0;
  const left = parseFloat(cs.paddingLeft) || 0;
  probe.remove();
  return { top, right, bottom, left };
}

export function viewportPad(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const w = window.innerWidth;
  const safe = readSafeAreaInsets();
  const baseX = w <= 768 ? 16 : 64;
  const baseY = w <= 768 ? 56 : 48;
  return {
    top: baseY + safe.top,
    right: baseX + safe.right,
    bottom: baseY + safe.bottom,
    left: baseX + safe.left,
  };
}

export function finalContainRect(aspect: number): OriginRect {
  const pad = viewportPad();
  const maxW = Math.max(120, window.innerWidth - pad.left - pad.right);
  const maxH = Math.max(120, window.innerHeight - pad.top - pad.bottom);
  let width = maxW;
  let height = width / aspect;
  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }
  return {
    width,
    height,
    left: pad.left + (maxW - width) / 2,
    top: pad.top + (maxH - height) / 2,
  };
}

export function readAspect(el: HTMLElement | null, fallback = 4 / 5): number {
  if (!el) return fallback;
  if (el instanceof HTMLImageElement && el.naturalWidth > 0 && el.naturalHeight > 0) {
    return el.naturalWidth / el.naturalHeight;
  }
  if (el instanceof HTMLVideoElement && el.videoWidth > 0 && el.videoHeight > 0) {
    return el.videoWidth / el.videoHeight;
  }
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) return r.width / r.height;
  return fallback;
}

export function rectFromElement(el: HTMLElement): OriginRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}
