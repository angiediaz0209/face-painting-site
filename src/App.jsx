import { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Gallery from './components/Gallery';
import Services from './components/Services';
import Clients from './components/Clients';
import About from './components/About';
import Reviews from './components/Reviews';
import FAQ from './components/FAQ';
import Contact from './components/Contact';
import ChatWidget from './components/ChatWidget';
import Reveal from './components/Reveal';
import ScrollVideo from './components/ScrollVideo';
import { MessageIcon, PaletteIcon } from './components/Icons';
import heroImg from './assets/us/face-painting-ca.png';


// Scroll-scrubbed hero clip. Set this to the file's path once it exists in
// public/ — e.g. '/hero-loop.mp4'. Left null so the site doesn't request a file
// that isn't there; the blurred still is the backdrop until then.
const HERO_VIDEO = null;

// Facts worth stating plainly, straight under the hero.
const facts = [
  ['Kid-safe paint', 'FDA-compliant, off with soap and water'],
  ['10–12 kids an hour', 'Even with detailed designs'],
  ['Free travel in Marin', 'Flat $35 to SF and Santa Rosa'],
];

export default function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const heroRef = useRef(null);
  const heroBgRef = useRef(null);
  const heroContentRef = useRef(null);

  // Hero parallax: the blurred backdrop drifts slower than the page and the
  // headline lifts away as you leave. Transform and opacity only, so it stays
  // on the compositor, and it stops doing work once the hero is off screen.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Distance over which the headline fades: measured so it only reaches zero
    // once the block has actually left through the top of the screen. A fixed
    // number leaves the buttons invisible but still on screen on tall phones.
    let fadeOver = 1;
    const measure = () => {
      const el = heroContentRef.current;
      if (!el) return;
      const prev = el.style.transform;
      el.style.transform = 'none';
      const rect = el.getBoundingClientRect();
      fadeOver = Math.max(1, rect.top + window.scrollY + rect.height);
      el.style.transform = prev;
    };

    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y > window.innerHeight * 1.5) return;
      if (heroBgRef.current) {
        heroBgRef.current.style.transform = `translate3d(0, ${y * 0.28}px, 0) scale(1.18)`;
      }
      if (heroContentRef.current) {
        heroContentRef.current.style.transform = `translate3d(0, ${y * 0.14}px, 0)`;
        heroContentRef.current.style.opacity = String(Math.max(0, 1 - y / fadeOver));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      schedule();
    };

    measure();
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Booking happens entirely inside Sky's chat, so every booking entry point on
  // the page just opens her.
  const openBooking = () => setIsChatOpen(true);

  // True once the visitor has sent at least one message — their chat is saved and can be resumed.
  const hasConversation = (() => {
    try {
      return JSON.parse(localStorage.getItem('sky-chat-history') || '[]').some((m) => m.role === 'user');
    } catch {
      return false;
    }
  })();

  return (
    /* clip, not hidden: `overflow-x: hidden` computes `overflow-y: auto`, which
       makes this div a scroll container and stops the header sticking. */
    <div className="min-h-screen bg-white overflow-x-clip">
      <Header onGetQuote={() => setIsChatOpen(true)} />

      <main>
        {/* Hero. Dark grounds across the site are `shade`, a deep brand rather
            than a neutral black, so the brand hue reads as atmosphere where
            `brand` itself would have no contrast. */}
        <section ref={heroRef} className="relative bg-shade text-white overflow-hidden">
          {/* Blurred and scaled past the edges: the photo is texture here, not a
              subject. Unblurred, the lettering on the booth banner reads through
              the scrim and fights the headline. */}
          <img
            ref={heroBgRef}
            src={heroImg}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-[0.6] blur-[2px] scale-110 will-change-transform"
          />
          {/* Sits over the still and replaces it when present. Same treatment,
              so the hero looks the same whether or not the clip loads. */}
          <ScrollVideo
            src={HERO_VIDEO}
            frameRef={heroRef}
            className="absolute inset-0 w-full h-full object-cover opacity-[0.16] blur-[6px] scale-110"
          />
          <div
            ref={heroContentRef}
            className="relative max-w-4xl mx-auto px-5 sm:px-8 py-12 sm:py-14 lg:py-16 text-center will-change-transform"
          >
            <p className="animate-fade-up font-body text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] sm:tracking-[0.22em] text-brand-light mb-6">
              Marin County · San Francisco · Santa Rosa
            </p>

            <h1 className="animate-fade-up-1 poster text-[3.25rem] sm:text-[5rem] lg:text-[6.75rem] mb-7">
              Face
              <br />
              Painting
            </h1>

            <p className="animate-fade-up-2 font-body text-base sm:text-lg text-white/70 leading-relaxed max-w-xl mx-auto mb-9">
              For Bay Area birthdays, school carnivals, festivals, and company
              picnics. Tell Sky your date and she'll check the calendar while
              you're here.
            </p>

            <div className="animate-fade-up-3 flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={openBooking} className="btn-accent">
                Check your date
              </button>
              <a href="#gallery" className="btn-onDark">
                See the work
              </a>
            </div>

            <p className="animate-fade-up-3 font-body text-sm text-white/45 mt-8">
              Or text{' '}
              <a href="sms:4159919374" className="font-semibold text-white hover:text-brand-light transition-colors">
                415-991-9374
              </a>
            </p>

            {/* The proof, on the same ground as the claim. Recoloured rather
                than moved: ink-on-white would be invisible here, so the label
                carries the weight in white and the detail drops back to /45 —
                the same two-tier contrast the closing band uses. Kept below the
                CTA so the panel still ends on its primary action. */}
            <dl className="animate-fade-up-3 mt-8 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-y-5 sm:gap-y-0 sm:divide-x sm:divide-white/10">
              {facts.map(([label, detail]) => (
                <div key={label} className="sm:px-5">
                  <dt className="font-body text-[13px] font-bold tracking-wide text-white">{label}</dt>
                  <dd className="font-body text-[13px] text-white/45 mt-1">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <Gallery />

        <Services onBook={openBooking} />

        <About />
        <Reviews />
        <Clients />
        <FAQ />
        <Contact onOpenChat={() => setIsChatOpen(true)} onOpenBooking={openBooking} />

        {/* Floating chat button */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] bg-brand hover:bg-brand-dark text-white font-body font-semibold text-sm p-4 sm:py-3 sm:px-5 rounded-full shadow-lift flex items-center gap-2.5 z-40 transition-colors"
          >
            <span className="relative flex">
              <MessageIcon className="w-5 h-5" />
              {hasConversation && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full ring-2 ring-brand" />
              )}
            </span>
            <span className="hidden sm:inline">
              {hasConversation ? 'Continue chat' : 'Chat with Sky'}
            </span>
          </button>
        )}
      </main>

      {/* Footer. Shares the closing band's ground so the page ends on one dark
          block instead of a white strip that repeated the band's own contents —
          the old version carried the name, the service areas and the phone, all
          three of which sit directly above it. What is left is the one thing
          the page did not already say: the copyright. */}
      <footer className="bg-shade">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 border-t border-white/10 flex flex-col sm:flex-row gap-5 sm:items-center sm:justify-between">
          <a href="#" className="flex items-center gap-2.5 shrink-0">
            <PaletteIcon className="w-5 h-5 text-brand-light" />
            <span className="font-body text-xs font-extrabold uppercase tracking-[0.14em] text-white">
              Face Painting <span className="text-brand-light">CA</span>
            </span>
          </a>
          <p className="font-body text-xs text-white/40">
            © {new Date().getFullYear()} Face Painting California
          </p>
        </div>
      </footer>

      {isChatOpen && <ChatWidget onClose={() => setIsChatOpen(false)} />}
    </div>
  );
}
