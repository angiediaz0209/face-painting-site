import { useEffect, useRef } from 'react';
import Reveal from './Reveal';
import ParallaxContent from './ParallaxContent';
import ScrollRevealText from './ScrollRevealText';
import { register, prefersReducedMotion } from '../lib/parallax';

import birthdayImg from '../assets/designs/services/birthday.png';
import setupImg from '../assets/designs/services/setup.jpg';
import festivalImg from '../assets/designs/services/festival.png';
import schoolEventImg from '../assets/designs/services/school-event.png';

const services = [
  {
    image: birthdayImg,
    focus: 'center 38%',
    title: 'Birthday Parties',
    desc: 'Superheroes, tigers, butterflies, unicorns. We get through 10 to 12 kids an hour, so the line keeps moving.',
  },
  {
    image: setupImg,
    focus: 'center 45%',
    title: 'Corporate Events',
    desc: 'Team picnics, holiday parties, family days. We can work in your brand colors, and plenty of adults end up in the chair.',
  },
  {
    image: festivalImg,
    // Faces sit at ~39-55% of this frame with plain torsos below; cropping at
    // 55% puts them in the upper half and leaves the lower half — where the
    // copy sits — on clothing rather than on a face.
    focus: 'center 55%',
    title: 'Festivals',
    desc: 'Quick designs built for a long line. Glitter, neon, and UV paint for events that run into the evening.',
  },
  {
    image: schoolEventImg,
    // Same structure: three faces at ~37-57%, sweaters below.
    focus: 'center 55%',
    title: 'School Events',
    desc: 'Carnivals, sports days, end-of-year fairs. School colors and mascots, and extra time booked once you get past about 23 kids.',
  },
];

/**
 * One panel of the stack.
 *
 * Every panel is `sticky top-0 h-screen`, so each one pins to the viewport and
 * the next slides up over it — the panels share one screen rather than
 * occupying four. Later siblings paint over earlier ones by DOM order, which is
 * exactly the stacking we want, so no z-index is needed.
 *
 * The dim overlay is driven by the *next* panel's position: as it rises to
 * cover this one, this one darkens, which is what sells the depth. Without it
 * the panels look like they are simply replacing each other.
 */
function Panel({ svc, index, onBook }) {
  const rootRef = useRef(null);
  const dimRef = useRef(null);
  const textRight = index % 2 === 1;

  useEffect(() => {
    const root = rootRef.current;
    const dim = dimRef.current;
    const next = root?.nextElementSibling;
    if (prefersReducedMotion() || !root || !dim || !next) return;

    return register({
      frame: next,
      target: dim,
      apply: (_progress, rect, target, vh) => {
        const covered = Math.min(1, Math.max(0, 1 - rect.top / vh));
        target.style.opacity = (covered * 0.6).toFixed(3);
      },
    });
  }, []);

  return (
    <article ref={rootRef} className="sticky top-0 h-screen flex items-end overflow-hidden bg-shade">
      {/* Below `lg` the photo takes the top 54% and the copy sits beneath it on
          the solid ground; from `lg` up it fills the panel and the copy overlays.
          This is a layout switch rather than a tuned percentage because
          `object-position` only bites on the axis that overflows: a wide
          viewport overflows the portrait sources vertically (so the focal point
          works), but a narrow one overflows horizontally and fits the height
          exactly — the vertical focus stops doing anything and the faces land
          wherever they fall, right under the copy. */}
      <img
        src={svc.image}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-x-0 top-0 h-[54%] lg:h-full w-full object-cover"
        style={{ objectPosition: svc.focus ?? 'center 42%' }}
      />
      {/* No wash over the photo — the type carries itself at this size, with a
          shadow on the glyphs doing the legibility work instead. */}
      {/* Darkens as the next panel slides over. */}
      <div ref={dimRef} className="absolute inset-0 bg-shade opacity-0 pointer-events-none" />

      <div
        /* Below the faces, which sit upper-middle in these photos, but not
           flush to the bottom — the next panel slides up from there, and copy
           pinned to the floor gets covered the moment the transition starts. */
        className={`relative w-full max-w-6xl mx-auto px-5 sm:px-8 pb-[10vh] sm:pb-[11vh] flex ${
          textRight ? 'lg:justify-end' : ''
        }`}
      >
        {/* Driven by the panel, not by itself: with no frame the block measures
            its own already-transformed rect, so each frame's offset feeds the
            next and the drift runs away from the configured distance. */}
        <ParallaxContent className="max-w-xl" frameRef={rootRef} distance={56}>
          <p className="on-photo font-body text-xs font-bold tracking-[0.24em] text-white/80 mb-5">
            {String(index + 1).padStart(2, '0')}
          </p>
          <ScrollRevealText
            as="h3"
            text={svc.title}
            frameRef={rootRef}
            className="on-photo poster text-[2.75rem] sm:text-6xl lg:text-7xl text-white mb-6 block"
          />
          <p className="on-photo font-body text-lg sm:text-xl text-white font-medium leading-snug mb-8 max-w-lg">
            {svc.desc}
          </p>
          <button onClick={onBook} className="btn-accent">
            Check availability
          </button>
        </ParallaxContent>
      </div>
    </article>
  );
}

export default function Services({ onBook }) {
  return (
    <section id="services" className="bg-sand border-t border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-10 sm:pb-14">
        <Reveal className="max-w-xl">
          <p className="eyebrow mb-3">Services</p>
          <h2 className="section-title mb-4">What we turn up for</h2>
          <p className="section-intro">Most of our work falls into one of these four.</p>
        </Reveal>
      </div>

      {/* The stack. Its height is what gives each panel its pinned dwell. */}
      <div className="relative">
        {services.map((svc, i) => (
          <Panel key={svc.title} svc={svc} index={i} onBook={onBook} />
        ))}
      </div>
    </section>
  );
}
