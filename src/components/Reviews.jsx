import { StarIcon } from './Icons';

const reviews = [
  {
    name: 'Sarah M.',
    event: 'Birthday Party',
    text: 'Steff was absolutely amazing! The kids were mesmerized and every single design was beautiful. She kept the line moving and made sure every child felt special. We will definitely book again!',
    stars: 5,
    color: 'bg-coral',
  },
  {
    name: 'Jessica L.',
    event: 'School Festival',
    text: 'We hired Face Painting California for our school carnival and the kids loved it! Professional, on time, and the designs were incredible. Highly recommend!',
    stars: 5,
    color: 'bg-purple',
  },
  {
    name: 'Maria T.',
    event: 'Corporate Event',
    text: 'Such a fun addition to our company picnic! Adults and kids alike were lining up. Steff brought great energy and amazing artistry. A total hit!',
    stars: 5,
    color: 'bg-teal',
  },
];

export default function Reviews() {
  return (
    <section id="reviews" className="py-14 sm:py-20 bg-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-display text-center text-navy mb-3">
          Happy Parents
        </h2>
        <p className="text-center text-navy/50 font-body mb-10">
          Loved by parents everywhere
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {reviews.map((review, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-light">
              <div className={`h-1.5 ${review.color}`} />
              <div className="p-6 sm:p-7">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: review.stars }).map((_, j) => (
                    <StarIcon key={j} className="w-4 h-4 text-sunshine" />
                  ))}
                </div>
                <p className="text-navy/70 font-body text-sm leading-relaxed mb-5 italic">
                  "{review.text}"
                </p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${review.color} rounded-full flex items-center justify-center`}>
                    <span className="text-white font-display text-sm">{review.name[0]}</span>
                  </div>
                  <div>
                    <p className="font-body font-bold text-navy text-sm">{review.name}</p>
                    <p className="text-gray font-body text-xs">{review.event}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
