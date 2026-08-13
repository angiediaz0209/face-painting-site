import { useState } from 'react';
import Reveal from './Reveal';

const faqs = [
  {
    q: 'What kind of paints do you use?',
    a: 'Professional water-based face paints, FDA-compliant and hypoallergenic. They come off with soap and water, no scrubbing.',
  },
  {
    q: 'How far in advance should I book?',
    a: "Two weeks is comfortable. Weekends go first, so if your date is a Saturday it's worth asking early. Chat with Sky or text 415-991-9374 and we'll tell you what's open.",
  },
  {
    q: 'How many kids can you paint per hour?',
    a: 'About 10 to 12 an hour with detailed designs, more if the designs are simple. Past roughly 23 kids, book extra time so the line does not get long.',
  },
  {
    q: 'What areas do you serve?',
    a: 'Marin County, San Francisco, and Santa Rosa. Travel is free in Marin and a flat $35 for SF and Santa Rosa.',
  },
  {
    q: 'What if it rains or we need to cancel?',
    a: "Text 415-991-9374 and we'll find another date. If your event is outdoors, it helps to have a covered spot in mind. The paints are water-based, so rain is a problem for the artwork as well as the setup.",
  },
  {
    q: 'Do you paint adults too?',
    a: 'Yes. At festivals and corporate events plenty of adults sit down, usually once one brave person goes first.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section id="faq" className="py-16 sm:py-24 bg-white border-t border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16">
          <Reveal>
            <p className="eyebrow mb-3">FAQ</p>
            <h2 className="section-title mb-4">The ones we get asked most</h2>
            <p className="section-intro">
              Anything else, text{' '}
              <a href="sms:4159919374" className="font-semibold text-brand hover:text-brand-dark transition-colors">
                415-991-9374
              </a>
              .
            </p>
          </Reveal>

          <Reveal delay={80} className="border-t border-line">
            {faqs.map((faq, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={i} className="border-b border-line">
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="w-full text-left py-5 flex items-start justify-between gap-6 group"
                    aria-expanded={isOpen}
                  >
                    <span className="font-body font-semibold text-ink text-[15px] sm:text-base group-hover:text-brand transition-colors">
                      {faq.q}
                    </span>
                    <span
                      className={`shrink-0 mt-0.5 text-slate transition-transform duration-300 ease-out ${
                        isOpen ? 'rotate-45' : ''
                      }`}
                    >
                      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8 2v12M2 8h12" strokeLinecap="round" />
                      </svg>
                    </span>
                  </button>
                  {/* 0fr → 1fr animates to the answer's natural height, whatever it is. */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="font-body text-[15px] text-slate leading-relaxed pb-6 pr-10 -mt-1">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
