import { PaletteIcon, ShieldCheckIcon } from './Icons';
import aboutImg from '../assets/us/face-painting-ca.png';

export default function About() {
  return (
    <section id="about" className="py-14 sm:py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-center">
          <div className="rounded-3xl h-80 md:h-96 overflow-hidden">
            <img src={aboutImg} alt="Face Painting California" className="w-full h-full object-cover rounded-3xl" />
          </div>

          <div>
            <p className="text-magenta font-body font-bold text-sm uppercase tracking-wider mb-2">About Us</p>
            <h2 className="text-3xl sm:text-4xl font-display text-navy mb-2">
              Face Painting California
            </h2>
            <p className="text-teal font-body font-bold text-sm mb-6">Professional Face Painting Services</p>

            <p className="text-navy/70 font-body mb-4 leading-relaxed">
              We're a Bay Area face painting company dedicated to making every event magical. From birthday parties with 10 excited kids to corporate events with 200 guests, our talented artists bring vibrant, creative designs that leave everyone smiling.
            </p>
            <p className="text-navy/70 font-body mb-8 leading-relaxed">
              Our team uses only professional, kid-safe paints and brings years of experience to every celebration. Whether it's Marin County, San Francisco, or Santa Rosa — we're ready to make your next event unforgettable!
            </p>

            <div className="flex gap-6 sm:gap-8 mb-8">
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-display text-purple">4.9/5</p>
                <p className="text-navy/50 font-body text-xs font-semibold uppercase">Rating</p>
              </div>
            </div>

            <div className="bg-mint/10 rounded-xl p-4 flex gap-3 items-start border border-mint/20">
              <ShieldCheckIcon className="w-5 h-5 text-mint shrink-0 mt-0.5" />
              <div>
                <p className="font-body font-bold text-navy text-sm">Safety First</p>
                <p className="text-navy/60 font-body text-xs leading-relaxed">FDA-compliant, professional-grade, hypoallergenic paints that are gentle on even the most sensitive skin.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
