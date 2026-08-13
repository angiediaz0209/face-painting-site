/**
 * Shared scroll engine for every parallax element on the page.
 *
 * One listener and one rAF loop for all of them. A listener per element means N
 * handlers each doing layout reads on the same frame, which is what makes
 * parallax-heavy pages stutter.
 *
 * Register with a `frame` (the element whose travel through the viewport drives
 * the effect), a `target` (the element that moves), and `shift(progress, rect)`
 * returning the offset in pixels. `progress` runs +1 when the frame sits below
 * the fold to -1 once it has passed above it.
 */

const items = new Set();
let frameId = 0;
let bound = false;

function update() {
  frameId = 0;
  const vh = window.innerHeight;

  for (const item of items) {
    const rect = item.frame.getBoundingClientRect();

    // Skipping off-screen frames is the main saving on a long page, but it
    // must not freeze an element mid-effect: a fast scroll or an anchor jump
    // can carry a frame off screen before its final value is written, leaving
    // (say) a panel dimmed as though still covered. So run one settle pass at
    // the moment it leaves, then skip until it returns.
    const onScreen = rect.bottom >= 0 && rect.top <= vh;
    if (!onScreen) {
      if (item.settled) continue;
      item.settled = true;
    } else {
      item.settled = false;
    }

    // Clamped to ±1. The ratio only lands in that range while the frame is near
    // the viewport; for a frame far above or below it grows without bound, and
    // an unclamped value scales straight into every consumer — an image
    // travelling past its own overflow and opening a gap, a copy block thrown
    // hundreds of pixels out of place.
    const centre = rect.top + rect.height / 2;
    const raw = (centre - vh / 2) / (vh / 2 + rect.height / 2);
    const progress = raw < -1 ? -1 : raw > 1 ? 1 : raw;

    // `apply` for anything that isn't a vertical translate (dimming, scaling).
    if (item.apply) item.apply(progress, rect, item.target, vh);
    else item.target.style.transform = `translate3d(0, ${item.shift(progress, rect).toFixed(2)}px, 0)`;
  }
}

function schedule() {
  if (!frameId) frameId = requestAnimationFrame(update);
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function register(item) {
  items.add(item);
  if (!bound) {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    bound = true;
  }
  schedule();

  return () => {
    items.delete(item);
    if (items.size === 0 && bound) {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      bound = false;
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    }
  };
}
