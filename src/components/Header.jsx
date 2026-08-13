import { useState, useEffect } from 'react';
import { PaletteIcon } from './Icons';

const navLinks = [
  { label: 'Work', href: '#gallery' },
  { label: 'Services', href: '#services' },
  { label: 'About', href: '#about' },
  { label: 'Reviews', href: '#reviews' },
  { label: 'FAQ', href: '#faq' },
];

export default function Header({ onGetQuote }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Over the hero the bar is part of the dark panel; past it, it condenses and
  // picks up an edge so it reads as a bar floating over the light page.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`bg-brand/95 backdrop-blur-md sticky top-0 z-40 transition-shadow duration-300 ${
        scrolled ? 'shadow-[0_1px_0_rgba(33,26,25,0.15),0_8px_24px_-12px_rgba(33,26,25,0.45)]' : ''
      }`}
    >
      <nav
        className={`max-w-6xl mx-auto px-5 sm:px-8 flex items-center justify-between gap-4 transition-[height] duration-300 ease-out ${
          scrolled ? 'h-14 sm:h-16' : 'h-16 sm:h-20'
        }`}
      >
        <a href="#" className="flex items-center gap-2.5 shrink-0">
          <PaletteIcon className="w-6 h-6 text-white" />
          <span className="font-body text-[13px] sm:text-sm font-extrabold uppercase tracking-[0.14em] text-white">
            Face Painting <span className="text-white/60">CA</span>
          </span>
        </a>

        <div className="hidden md:flex items-center gap-7 lg:gap-9">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-body text-[15px] font-medium text-white/80 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <a
            href="tel:4159919374"
            className="hidden lg:block font-body text-[15px] font-semibold text-white/90 hover:text-white transition-colors"
          >
            415-991-9374
          </a>
          <button onClick={onGetQuote} className="hidden md:inline-flex btn !px-5 !py-2.5 !text-sm bg-ink text-white hover:bg-ink-soft">
            Check a date
          </button>

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden flex flex-col gap-[5px] p-2.5 -mr-2.5"
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
          >
            <span className={`block w-5 h-[1.5px] bg-white transition-all ${isMenuOpen ? 'rotate-45 translate-y-[6.5px]' : ''}`} />
            <span className={`block w-5 h-[1.5px] bg-white transition-all ${isMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-[1.5px] bg-white transition-all ${isMenuOpen ? '-rotate-45 -translate-y-[6.5px]' : ''}`} />
          </button>
        </div>
      </nav>

      {isMenuOpen && (
        <div className="md:hidden bg-brand border-t border-white/20 px-5 py-4 animate-menu-in">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className="block font-body font-medium text-white/85 py-3 border-b border-white/20"
            >
              {link.label}
            </a>
          ))}
          <a href="tel:4159919374" className="block font-body font-semibold text-white py-3 border-b border-white/20">
            415-991-9374
          </a>
          <button
            onClick={() => { setIsMenuOpen(false); onGetQuote(); }}
            className="btn w-full mt-4 bg-ink text-white hover:bg-ink-soft"
          >
            Check a date
          </button>
        </div>
      )}
    </header>
  );
}
