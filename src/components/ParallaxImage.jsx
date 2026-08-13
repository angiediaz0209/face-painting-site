import { useEffect, useRef } from 'react';
import { register, prefersReducedMotion } from '../lib/parallax';

/**
 * A photo that drifts inside its frame as the frame crosses the viewport.
 *
 * The image is oversized by `strength` in both directions and never travels
 * further than that overflow, so a gap can't open at either edge.
 *
 * `className` sizes the frame — it must resolve to a real height. Don't pass
 * `absolute inset-0`: the root already carries `relative`, which Tailwind emits
 * after `absolute` and so wins, leaving the frame zero-high. Put the
 * positioning on a wrapper and give this `w-full h-full`.
 */
export default function ParallaxImage({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  strength = 0.12,
  loading = 'lazy',
  ...rest
}) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion() || !wrapRef.current || !imgRef.current) return;
    return register({
      frame: wrapRef.current,
      target: imgRef.current,
      shift: (progress, rect) => -progress * strength * rect.height,
    });
  }, [strength]);

  const overflow = strength * 100;

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        className={`absolute left-0 w-full object-cover will-change-transform ${imgClassName}`}
        style={{ height: `${100 + overflow * 2}%`, top: `-${overflow}%` }}
        {...rest}
      />
    </div>
  );
}
