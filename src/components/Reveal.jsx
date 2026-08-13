import { useEffect, useRef, useState } from 'react';

/**
 * Fades its children up once, when they first scroll into view.
 *
 * Deliberately uses a scroll listener rather than IntersectionObserver. The
 * failure mode of a missed observer callback is a section stranded invisible,
 * which is far worse than a missing animation — a rAF-throttled rect check on
 * scroll has no such failure mode, and runs the check once on mount so
 * anything already on screen is shown straight away.
 */
export default function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }

    let frame = 0;
    const check = () => {
      frame = 0;
      if (!ref.current) return;
      // Trigger a little before the top edge reaches the bottom of the screen.
      if (ref.current.getBoundingClientRect().top < window.innerHeight * 0.92) {
        setShown(true);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };

    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${shown ? 'reveal-in' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}
