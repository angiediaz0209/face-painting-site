import Reveal from './Reveal';
import ParallaxImage from './ParallaxImage';
import bandImg from '../assets/us/face-painting-ca.png';

export default function Contact({ onOpenChat }) {
  return (
    <section id="contact" className="relative bg-shade overflow-hidden">
      {/* Same treatment as the hero, so the page opens and closes on it.
          The positioning lives on this wrapper: ParallaxImage sets `relative`
          on its own root, which Tailwind emits after `absolute` and so wins. */}
      <div className="absolute inset-0" aria-hidden="true">
        <ParallaxImage
          src={bandImg}
          className="w-full h-full"
          imgClassName="opacity-[0.22] blur-[6px] scale-105"
          strength={0.16}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-shade via-shade/80 to-shade" />

      <Reveal className="relative max-w-6xl mx-auto px-5 sm:px-8 py-12 sm:py-14 text-center">
        <h2 className="font-display text-[2rem] sm:text-[2.75rem] leading-[1.12] text-white mb-3">
          Ready to book?
        </h2>
        <p className="font-body text-white/60 leading-relaxed max-w-md mx-auto mb-6">
          Tell Sky your date and she'll check the calendar. Or text us. Either works.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-9">
          <button onClick={onOpenChat} className="btn-accent">
            Chat with Sky
          </button>
          <a href="sms:4159919374" className="btn-onDark">
            Text 415-991-9374
          </a>
        </div>

        {/* Label and areas on one line — as two stacked blocks this was the
            tallest part of the band for the least information on the page. */}
        <div className="pt-7 border-t border-white/10">
          <p className="font-body text-sm text-white/70">
            <span className="font-bold uppercase tracking-[0.16em] text-[11px] text-brand-light mr-3">
              Service areas
            </span>
            Marin County · San Francisco · Santa Rosa
          </p>
        </div>
      </Reveal>
    </section>
  );
}
