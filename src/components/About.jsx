import { CheckIcon } from './Icons';
import aboutImg from '../assets/us/face-painting-ca.png';

export default function About() {
  return (
    <section id="about" className="relative py-14 sm:py-24 bg-white overflow-hidden">
      {/* pale accent blob */}
      <div className="absolute top-10 right-8 w-52 h-52 bg-sunshine/30 rounded-full" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 sm:gap-14 items-center">
          {/* Stacked, tilted image cards */}
          <div className="relative py-4">
            {/* card behind */}
            <div className="absolute inset-0 bg-teal/20 rounded-[2rem] rotate-[4deg] translate-x-4 -translate-y-1" />
            {/* main photo card */}
            <div className="relative z-10 rounded-[2rem] overflow-hidden shadow-[0_22px_44px_-14px_rgba(27,40,56,0.28)] -rotate-2">
              <img
                src={aboutImg}
                alt="Face Painting California artist"
                loading="lazy"
                className="w-full aspect-[4/5] object-cover"
              />
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="text-coral font-body font-extrabold text-sm uppercase tracking-wider mb-2">About Us</p>
            <h2 className="text-4xl sm:text-5xl font-display text-navy mb-2 leading-tight">
              Face Painting California
            </h2>
            <p className="text-teal font-script font-bold text-2xl sm:text-3xl mb-6">
              Professional face painting
            </p>

            <p className="text-navy/70 font-body mb-4 leading-relaxed">
              We're a Bay Area face painting company dedicated to making every event magical. From birthday parties with 10 excited kids to corporate events with 200 guests, our talented artists bring vibrant, creative designs that leave everyone smiling.
            </p>
            <p className="text-navy/70 font-body mb-8 leading-relaxed">
              Whether it's Marin County, San Francisco, or Santa Rosa — we're ready to make your next event unforgettable!
            </p>

            <div className="bg-mint/15 rounded-2xl p-5 sm:p-6 flex gap-4 items-start">
              <span className="w-11 h-11 bg-mint text-white rounded-full rounded-bl-none flex items-center justify-center shrink-0">
                <CheckIcon className="w-5 h-5" />
              </span>
              <div>
                <p className="font-body font-bold text-navy mb-1">Safety First</p>
                <p className="text-navy/60 font-body text-sm leading-relaxed">FDA-compliant, professional-grade, hypoallergenic paints that are gentle on even the most sensitive skin.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
