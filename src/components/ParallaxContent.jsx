import { useEffect, useRef } from 'react';
import { register, prefersReducedMotion } from '../lib/parallax';

/**
 * Content that drifts against the scroll while its section stays put.
 *
 * The mirror of ParallaxImage: there the frame is fixed and the photo moves
 * inside it; here the photo is a static background and this is what moves.
 * `distance` is the peak offset in pixels, reached as the section enters and
 * again as it leaves — keep it well under the section's padding or the block
 * will drift into its own edges.
 */
export default function ParallaxContent({
  children,
  className = '',
  distance = 64,
  frameRef,
}) {
  const selfRef = useRef(null);

  useEffect(() => {
    const target = selfRef.current;
    const frame = frameRef?.current ?? target;
    if (prefersReducedMotion() || !target || !frame) return;
    return register({
      frame,
      target,
      shift: (progress) => -progress * distance,
    });
  }, [distance, frameRef]);

  return (
    <div ref={selfRef} className={`will-change-transform ${className}`}>
      {children}
    </div>
  );
}
