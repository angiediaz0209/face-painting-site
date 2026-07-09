import { StarIcon } from './Icons';

const reviews = [
  {
    name: 'Sarah M.',
    event: 'Birthday Party',
    text: 'Steff was absolutely amazing! The kids were mesmerized and every single design was beautiful. She kept the line moving and made sure every child felt special. We will definitely book again!',
    stars: 5,
    color: 'bg-coral',
    starColor: 'text-coral',
  },
  {
    name: 'Jessica L.',
    event: 'School Festival',
    text: 'We hired Face Painting California for our school carnival and the kids loved it! Professional, on time, and the designs were incredible. Highly recommend!',
    stars: 5,
    color: 'bg-purple',
    starColor: 'text-purple',
  },
  {
    name: 'Maria T.',
    event: 'Corporate Event',
    text: 'Such a fun addition to our company picnic! Adults and kids alike were lining up. Steff brought great energy and amazing artistry. A total hit!',
    stars: 5,
    color: 'bg-teal',
    starColor: 'text-teal',
  },
];

export default function Reviews() {
  return (
    <section id="reviews" className="relative py-14 sm:py-24 bg-white overflow-hidden">
      {/* pale accent blob (like the reference) */}
      <div className="absolute bottom-10 left-0 w-52 h-52 bg-sunshine/30 rounded-full -ml-24" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <h2 className="text-4xl sm:text-5xl font-display text-center text-navy mb-3">
          Happy{' '}
          <span className="relative inline-block text-teal font-script font-bold pr-1">
            Clients
            <svg
              className="absolute left-0 -bottom-2 w-full"
              viewBox="0 0 150 14"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M4 9C40 4 80 4 116 7C130 8 140 9 146 6"
                stroke="#FF6B6B"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h2>
        <p className="text-center text-navy/50 font-body text-lg mb-12">
          Loved by parents everywhere
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {reviews.map((review, i) => (
            <div
              key={i}
              className={`bg-cream rounded-3xl p-7 sm:p-8 shadow-[0_18px_34px_-14px_rgba(27,40,56,0.22)] transition-transform duration-300 hover:-translate-y-1 ${
                i === 2 ? 'md:col-span-2 md:max-w-lg md:mx-auto' : ''
              }`}
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: review.stars }).map((_, j) => (
                  <StarIcon key={j} className={`w-5 h-5 ${review.starColor}`} />
                ))}
              </div>
              <p className="text-navy/80 font-body text-base leading-relaxed mb-6 italic">
                "{review.text}"
              </p>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 ${review.color} rounded-full flex items-center justify-center shrink-0`}>
                  <span className="text-white font-display text-base">{review.name[0]}</span>
                </div>
                <div>
                  <p className="font-body font-bold text-navy">{review.name}</p>
                  <p className="text-gray font-body text-sm">{review.event}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
