import { useState } from 'react';
import { PaletteIcon } from './Icons';

const navLinks = [
  { label: 'Services', href: '#services' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'About', href: '#about' },
  { label: 'Reviews', href: '#reviews' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

export default function Header({ onGetQuote }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-40">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
        <a href="#" className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PaletteIcon className="w-7 h-7 sm:w-8 sm:h-8 text-coral" />
          <h1 className="font-display text-base sm:text-lg text-navy">
            Face Painting <span className="text-coral">CA</span>
          </h1>
        </a>

        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-navy hover:text-coral font-body font-semibold text-sm transition">
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <a href="tel:4159919374" className="hidden lg:flex items-center gap-1.5 text-navy font-bold font-body text-sm">
            <span className="text-teal">&#9742;</span> 415-991-9374
          </a>
          <button
            onClick={onGetQuote}
            className="hidden md:block bg-coral hover:bg-coral-dark text-white font-body font-bold py-2 px-4 sm:px-6 rounded-full text-xs sm:text-sm transition-all hover:shadow-md active:scale-95"
          >
            Book Now
          </button>

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden flex flex-col gap-1.5 p-2.5 -mr-1"
            aria-label="Toggle menu"
          >
            <span className={`block w-6 h-0.5 transition-all ${isMenuOpen ? 'rotate-45 translate-y-2 bg-coral' : 'bg-navy'}`} />
            <span className={`block w-6 h-0.5 transition-all ${isMenuOpen ? 'opacity-0' : 'bg-navy'}`} />
            <span className={`block w-6 h-0.5 transition-all ${isMenuOpen ? '-rotate-45 -translate-y-2 bg-coral' : 'bg-navy'}`} />
          </button>
        </div>
      </nav>

      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-coral/10 px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className="block text-navy hover:text-coral hover:bg-coral/5 font-body font-semibold py-3.5 px-4 rounded-xl transition text-base"
            >
              {link.label}
            </a>
          ))}
          <a href="tel:4159919374" className="block text-teal font-bold font-body py-3.5 px-4 text-base">
            &#9742; 415-991-9374
          </a>
          <button
            onClick={() => { setIsMenuOpen(false); onGetQuote(); }}
            className="w-full mt-2 bg-coral hover:bg-coral-dark text-white font-body font-bold py-3.5 px-4 rounded-full text-base transition"
          >
            Book Your Event
          </button>
        </div>
      )}
    </header>
  );
}
