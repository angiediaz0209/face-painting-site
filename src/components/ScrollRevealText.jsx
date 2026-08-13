import { useLayoutEffect, useRef } from 'react';
import { register, prefersReducedMotion } from '../lib/parallax';

const clamp = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Text whose letters arrive one after another, driven by scroll position
 * rather than by a timer — scrub back up and they retreat again.
 *
 * `frame` is the panel the text sits in. On a sticky panel the useful window is
 * the entry phase: progress runs 1 → 0 as the panel rises to pin, so the reveal
 * is mapped to finish slightly before it pins, leaving the headline settled and
 * readable for the whole time it is held on screen.
 *
 * Letters are split into spans, so the heading carries an aria-label and the
 * spans are hidden from assistive tech — otherwise some screen readers
 * announce the text one character at a time.
 */
export default function ScrollRevealText({
  text,
  as: Tag = 'span',
  className = '',
  frameRef,
  stagger = 0.6,
  distance = 26,
}) {
  const rootRef = useRef(null);
  const letters = useRef([]);

  useLayoutEffect(() => {
    const els = letters.current.filter(Boolean);
    const frame = frameRef?.current ?? rootRef.current;

    const showAll = () => {
      els.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    };

    if (prefersReducedMotion() || !frame || els.length === 0) {
      showAll();
      return;
    }

    const span = 1 - stagger; // how much of the run each letter animates over
    const last = Math.max(1, els.length - 1);

    return register({
      frame,
      target: rootRef.current,
      apply: (progress) => {
        // Finish the reveal at progress 0.25, just before the panel pins.
        const run = clamp((1 - progress) / 0.75);
        for (let i = 0; i < els.length; i++) {
          const start = (i / last) * stagger;
          const t = clamp((run - start) / span);
          els[i].style.opacity = t.toFixed(3);
          els[i].style.transform = `translate3d(0, ${((1 - t) * distance).toFixed(1)}px, 0)`;
        }
      },
    });
  }, [text, stagger, distance, frameRef]);

  let index = 0;
  const words = text.split(' ');

  return (
    <Tag ref={rootRef} className={className} aria-label={text}>
      {words.map((word, wi) => (
        <span key={wi} className="inline-block whitespace-nowrap" aria-hidden="true">
          {[...word].map((char, ci) => {
            const i = index++;
            return (
              <span
                key={ci}
                ref={(el) => (letters.current[i] = el)}
                className="inline-block will-change-[opacity,transform]"
                style={{ opacity: 0 }}
              >
                {char}
              </span>
            );
          })}
          {wi < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  );
}
