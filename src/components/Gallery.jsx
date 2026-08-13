import { useState, useEffect, useCallback } from 'react';
import Reveal from './Reveal';

import butterflyImg from '../assets/designs/butterfly.jpg';
import tigerImg from '../assets/designs/tiger.jpg';
import princessImg from '../assets/designs/princess.jpg';
import rainbowImg from '../assets/designs/rainbow.jpg';
import unicornImg from '../assets/designs/unicorn.jpg';
import superheroImg from '../assets/designs/superhero-new.jpg';
import skullImg from '../assets/designs/skull-art.jpg';
import birthdayImg from '../assets/designs/birthday.jpg';
import setupImg from '../assets/designs/setup.jpg';

// Shown until (and unless) owner-uploaded photos load from the dashboard.
const fallbackImages = [
  { src: butterflyImg, alt: 'Butterfly face paint' },
  { src: tigerImg, alt: 'Tiger face paint' },
  { src: princessImg, alt: 'Princess face paint' },
  { src: rainbowImg, alt: 'Rainbow face paint' },
  { src: unicornImg, alt: 'Unicorn face paint' },
  { src: superheroImg, alt: 'Superhero face paint' },
  { src: skullImg, alt: 'Skull art face paint' },
  { src: birthdayImg, alt: 'Birthday party face painting' },
  { src: setupImg, alt: 'Face painting setup' },
];

/** A tile that fades its photo in on load, so the grid fills smoothly. */
function Tile({ img, onOpen }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      onClick={onOpen}
      className="group relative block w-full h-full overflow-hidden rounded-card bg-sand-deep"
      aria-label={`View ${img.alt}`}
    >
      <img
        src={img.src}
        alt={img.alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-[transform,opacity,filter] duration-700 ease-out
          group-hover:scale-[1.05] group-hover:brightness-105 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Lifts on hover rather than dimming — a dark wash hides the artwork at
          exactly the moment someone is trying to look at it. Kept very sheer so
          the veil reads as a highlight, not a film over the design. */}
      <span className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.05] transition-colors duration-300" />
    </button>
  );
}

export default function Gallery() {
  const [openIndex, setOpenIndex] = useState(null);
  const [galleryImages, setGalleryImages] = useState(fallbackImages);

  // Load owner-uploaded photos; keep the built-in ones if none/failed.
  useEffect(() => {
    let active = true;
    fetch('/api/owner?public=gallery')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!active || !Array.isArray(data) || data.length === 0) return;
        setGalleryImages(data.map((g) => ({ src: g.url, alt: g.alt || 'Face painting' })));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const isOpen = openIndex !== null;
  const step = useCallback(
    (delta) => setOpenIndex((i) => (i === null ? i : (i + delta + galleryImages.length) % galleryImages.length)),
    [galleryImages.length]
  );

  // Arrow keys page through, Escape closes, and the page behind stays put.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenIndex(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, step]);

  const current = isOpen ? galleryImages[openIndex] : null;

  return (
    <section id="gallery" className="py-16 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal className="max-w-xl mb-10 sm:mb-14">
          <p className="eyebrow mb-3">Our work</p>
          <h2 className="section-title mb-4">Some of what we paint</h2>
          <p className="section-intro">Tap any photo to see it full size.</p>
        </Reveal>

        {/* Mosaic: every fifth photo takes a 2×2 cell, and `grid-auto-flow:
            dense` back-fills the holes that leaves. The pattern is index-based
            so it still works when the owner uploads a different number of
            photos. Stagger runs across each row, not down the whole grid, so
            the last tile is never left waiting. */}
        <div className="gallery-grid grid grid-cols-2 lg:grid-cols-4 auto-rows-[44vw] sm:auto-rows-[210px] lg:auto-rows-[200px] gap-3 sm:gap-4 [grid-auto-flow:dense]">
          {galleryImages.map((img, i) => (
            <Reveal
              key={i}
              delay={(i % 3) * 70}
              className={i % 5 === 0 ? 'col-span-2 row-span-2' : ''}
            >
              <Tile img={img} onOpen={() => setOpenIndex(i)} />
            </Reveal>
          ))}
        </div>
      </div>

      {current && (
        <div
          className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in"
          onClick={() => setOpenIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
        >
          <button
            onClick={() => setOpenIndex(null)}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 w-10 h-10 rounded-full bg-ink/60 backdrop-blur-sm text-white/80 hover:text-white hover:bg-ink/80 flex items-center justify-center text-2xl transition-colors"
            aria-label="Close"
          >
            &times;
          </button>

          {galleryImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-ink/60 backdrop-blur-sm text-white/80 hover:text-white hover:bg-ink/80 flex items-center justify-center transition-colors"
                aria-label="Previous photo"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); step(1); }}
                className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-ink/60 backdrop-blur-sm text-white/80 hover:text-white hover:bg-ink/80 flex items-center justify-center transition-colors"
                aria-label="Next photo"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}

          <figure className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* Keyed on index so each photo re-runs the entrance animation. */}
            <img
              key={openIndex}
              src={current.src}
              alt={current.alt}
              className="w-full max-h-[78vh] object-contain rounded-card animate-pop-in"
            />
            <figcaption className="text-center font-body text-sm text-white/50 mt-4">
              {openIndex + 1} of {galleryImages.length}
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
