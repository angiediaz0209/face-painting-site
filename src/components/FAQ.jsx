import { useState } from 'react';

const faqs = [
  {
    q: 'What kind of paints do you use?',
    a: 'We use only professional, FDA-compliant, water-based face paints that are completely safe for kids and adults. They wash off easily with soap and water.',
  },
  {
    q: 'How far in advance should I book?',
    a: 'We recommend booking at least 2 weeks in advance, especially for weekends. Popular dates fill up fast! Chat with Sky or text us at 415-991-9374 to check availability.',
  },
  {
    q: 'How many kids can you paint per hour?',
    a: 'One artist can paint about 10-12 kids per hour with detailed designs, or more with simpler designs. For larger groups (23+), we recommend adding a second artist.',
  },
  {
    q: 'What areas do you serve?',
    a: 'We serve Marin County (free travel!), San Francisco, and Santa Rosa. Travel fees are $35 for SF and Santa Rosa.',
  },
  {
    q: 'What if it rains or we need to cancel?',
    a: 'We understand plans change! Please reach out to us at 415-991-9374 to discuss rescheduling options. We always try to be flexible.',
  },
  {
    q: 'Do you paint adults too?',
    a: 'Absolutely! Adults love face painting just as much as kids. We do corporate events, private parties, festivals — everyone gets a design they love.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section id="faq" className="py-14 sm:py-20 bg-purple/5">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-display text-center text-navy mb-3">
          Common Questions
        </h2>
        <p className="text-center text-navy/50 font-body mb-10">Everything you need to know</p>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-light">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full text-left px-5 sm:px-6 py-4 flex items-center justify-between hover:bg-cream transition"
              >
                <span className="font-body font-bold text-navy text-sm sm:text-base pr-4">{faq.q}</span>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm font-bold transition-all ${openIndex === i ? 'bg-purple text-white rotate-45' : 'bg-purple/10 text-purple'}`}>
                  +
                </span>
              </button>
              {openIndex === i && (
                <div className="px-5 sm:px-6 pb-5 text-navy/70 font-body text-sm leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
