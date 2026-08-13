import { useEffect, useRef, useState } from 'react';
import { register, prefersReducedMotion } from '../lib/parallax';

/**
 * A background video that is scrubbed by scroll position and never plays on its
 * own — scroll down and it advances, scroll up and it runs backwards.
 *
 * `play()` is deliberately never called. The element stays paused for its whole
 * life and only `currentTime` is written, which is what makes the motion feel
 * tied to the page rather than running alongside it.
 *
 * Falls back to nothing if the file is missing or the browser refuses it, so
 * whatever sits behind this (the blurred still) remains the backdrop. Under
 * reduced-motion it holds on the first frame.
 */
export default function ScrollVideo({ src, className = '', frameRef, onReady }) {
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!src || failed || !video) return;

    const frame = frameRef?.current ?? video.parentElement;
    if (!frame || prefersReducedMotion()) return;

    let unregister = null;
    let lastWritten = -1;

    const start = () => {
      if (unregister) return;
      unregister = register({
        frame,
        target: video,
        apply: (progress, rect, target) => {
          const duration = target.duration;
          if (!duration || !Number.isFinite(duration)) return;

          // progress runs 1 (below the fold) → -1 (above it); map to 0…1.
          const t = Math.min(1, Math.max(0, (1 - progress) / 2)) * duration;

          // Seeking is expensive. Skip sub-frame moves, or the decoder is asked
          // to do work no one can see.
          if (Math.abs(t - lastWritten) < 1 / 30) return;
          lastWritten = t;
          target.currentTime = t;
        },
      });
      onReady?.();
    };

    video.addEventListener('loadedmetadata', start);
    if (video.readyState >= 1) start();

    return () => {
      video.removeEventListener('loadedmetadata', start);
      unregister?.();
    };
  }, [src, failed, frameRef, onReady]);

  if (!src || failed) return null;

  return (
    <video
      ref={videoRef}
      src={src}
      className={className}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onError={() => setFailed(true)}
    />
  );
}
